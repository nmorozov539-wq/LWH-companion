// extension/core/scenario-service.js
//
// Orchestrates scenario management (start/restart flows, templates, manual
// editing, and AI-assisted generation) exposed through slash commands.

import { loadTemplates, findTemplateById } from "../modules/templates.js";

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

const HELP_TEXT = `Usage:
/lwhscenarios list
/lwhscenarios apply <templateId>
/lwhscenarios edit
/lwhscenarios ai
/lwhscenarios reset
`;

export class ScenarioService {
  constructor(runtime) {
    this.runtime = runtime;
    this.templates = loadTemplates();
  }

  listTemplateNames() {
    return this.templates.map((tpl) => tpl.name);
  }

  getTemplates() {
    return this.templates.map(({ id, name, description }) => ({ id, name, description }));
  }

  applyTemplate(templateId) {
    const template = findTemplateById(templateId);
    if (!template) {
      throw new Error(`Unknown template "${templateId}"`);
    }

    for (const moduleId of Object.keys(template.payload)) {
      this.runtime.state.registerNamespace(moduleId);
      this.runtime.state.setState(moduleId, deepClone(template.payload[moduleId]));
    }

    return template;
  }

  async handleCommand(rawArgs = "", context = {}) {
    const input = typeof rawArgs === "string" ? rawArgs : "";
    const args = input.trim().split(/\s+/).filter(Boolean);
    const subcommand = args.shift()?.toLowerCase();

    switch (subcommand) {
      case "list":
        return this._cmdList();
      case "apply":
        return this._cmdApply(args[0]);
      case "edit":
        return this._cmdEdit(context);
      case "ai":
        return this._cmdAI(context);
      case "reset":
        return this._cmdReset();
      case "help":
      case undefined:
        return HELP_TEXT;
      default:
        return `Unknown subcommand "${subcommand}".\n` + HELP_TEXT;
    }
  }

  _cmdList() {
    const rows = this.getTemplates()
      .map((tpl) => `• ${tpl.id}: ${tpl.name} — ${tpl.description}`)
      .join("\n");
    return rows || "No templates defined.";
  }

  _cmdApply(templateId) {
    if (!templateId) {
      return "Usage: /lwhscenarios apply <templateId>";
    }
    try {
      const tpl = this.applyTemplate(templateId);
      toastr.success(`Template "${tpl.name}" applied.`, "LWH Companion");
      return `Applied template "${tpl.name}".`;
    } catch (err) {
      console.error("[ScenarioService] apply failed:", err);
      toastr.error(err.message, "LWH Companion");
      return err.message;
    }
  }

  async _cmdEdit({ popupType, popup, refresh }) {
    if (typeof popup !== "function") {
      return "Popup API not available in this ST build.";
    }

    // Build editable payload: only .data of each module, no version metadata.
    // Future modules appear automatically via getContract().
    const contract = this.runtime.getContract();
    const editable = {};
    for (const [moduleId, section] of Object.entries(contract.sections || {})) {
      editable[moduleId] = section.data ?? section;
    }
    const json = JSON.stringify(editable, null, 2);
    const textareaId = "lwh-edit-" + Date.now();

    // Capture textarea value via event delegation so we have it even if the
    // popup removes the element from the DOM before we can read it.
    let liveValue = json;
    const onInput = (e) => {
      if (e.target.id === textareaId) liveValue = e.target.value;
    };
    document.addEventListener("input", onInput);

    let confirmed;
    try {
      confirmed = await popup(
        "<h3 style='margin:0 0 8px;'>LWH — Edit State</h3>" +
        "<p style='margin:0 0 8px;font-size:.85em;color:#aaa;'>Edit module values. Future modules appear here automatically.</p>" +
        `<textarea id="${textareaId}" style="width:100%;height:300px;font-family:monospace;font-size:12px;resize:vertical;" spellcheck="false">${json}</textarea>`,
        popupType.CONFIRM
      );
    } finally {
      document.removeEventListener("input", onInput);
    }

    if (!confirmed) return "Edit cancelled.";

    // Prefer live DOM value (still there in most ST versions), fall back to
    // the event-captured value if the element was already removed.
    const value = (document.getElementById(textareaId)?.value ?? liveValue).trim();
    if (!value) return "Edit cancelled (empty).";

    try {
      const parsed = JSON.parse(value);
      this._applySectionsPayload(parsed);
      await this.runtime.saveNow();
      refresh?.();
      toastr.success("State updated.", "LWH Companion");
      return "State updated.";
    } catch (err) {
      console.error("[ScenarioService] Edit parse error:", err);
      toastr.error(err.message, "LWH Companion");
      return `Invalid JSON: ${err.message}`;
    }
  }

  async _cmdAI({ requestAPICall, popup, popupType }) {
    if (typeof requestAPICall !== "function") {
      return "AI generation not supported in this SillyTavern build.";
    }

    const context = SillyTavern.getContext();
    const prompt = this._buildAIPrompt(context);

    const response = await requestAPICall({
      body: {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 600,
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      toastr.error("AI response missing content.", "LWH Companion");
      return "AI did not return usable content.";
    }

    try {
      const parsed = JSON.parse(content);
      this._applySectionsPayload(parsed);
      toastr.success("AI-generated state applied.", "LWH Companion");
      return "AI-generated state applied.";
    } catch (err) {
      console.error("[ScenarioService] AI JSON parse failed:", err, content);
      if (typeof popup === "function") {
        await popup(
          `<h3>AI response could not be parsed</h3><pre style="white-space:pre-wrap;text-align:left;">${content}</pre>`,
          popupType.TEXT
        );
      }
      toastr.error("AI response was not valid JSON.", "LWH Companion");
      return "AI response was not valid JSON.";
    }
  }

  async _cmdReset() {
    await this.runtime.resetState();
    toastr.success("State reset to defaults.", "LWH Companion");
    return "Runtime state reset.";
  }

  _applySectionsPayload(sectionsPayload) {
    if (!sectionsPayload || typeof sectionsPayload !== "object") {
      throw new Error("Returned payload must be an object of moduleId -> data");
    }

    for (const [moduleId, data] of Object.entries(sectionsPayload)) {
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error(`Module "${moduleId}" payload must be an object.`);
      }
      this.runtime.state.registerNamespace(moduleId);
      this.runtime.state.setState(moduleId, deepClone(data));
    }
  }

  _buildAIPrompt(context) {
    const personaSummary = context?.persona?.description || "";
    const characterSummary = context?.active_character?.description || "";
    const templateHelp = this.getTemplates()
      .map((tpl) => `${tpl.id}: ${tpl.name} — ${tpl.description}`)
      .join("\n");

    return `You are assisting with initializing a roleplaying scenario state for the player.

Player persona:
${personaSummary}

Active character card:
${characterSummary}

The state must describe the PLAYER's stats/resources, not the NPC.
Output valid JSON only (no Markdown, no explanation). Use this shape:
{
  "resources": { "gold": number, "rations": number },
  "combat": { "inProgress": boolean },
  "weather": { "condition": string, "temperature": string }
}

Sign rules (write deltas from the player's perspective):
- Positive = the player gains (NPC gives gold -> +10).
- Negative = the player loses (player gives away 5 rations -> -5).

Available templates (for inspiration):
${templateHelp}

Consider the persona and current context. Return only the JSON object described above.`;
  }
}
