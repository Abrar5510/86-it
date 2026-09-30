// Builds the station's inline Voice Agent session config (the session.update payload).
// The Worker, the eval harness and the tests all use this builder. Menu enums and keyterms come from data/menu.json.
// test/fixtures/session-2026-09-17.json is the exact config behind the recorded 97% eval;
// session.test.js pins session-2026-09-26.json (same, plus number keyterms one..twenty).
export const SAMPLE_RATE = 24000; // what the browser worklet and the eval clips produce

export function sessionConfig({ config, menu, prompt, voiceFocus = true }) {
  const menuNames = menu.map((m) => m.name.toLowerCase());
  const tools = config.tools.map((t) => {
    const tool = structuredClone(t);
    for (const prop of Object.values(tool.parameters?.properties || {})) if (prop.enum === '__MENU__') prop.enum = menuNames;
    return tool;
  });
  const { keyterms = [], voice_focus, voice_focus_threshold, ...input } = config.input;
  return {
    system_prompt: prompt,
    tools,
    input: {
      ...input,
      keyterms: [...new Set([...keyterms, ...menu.flatMap((m) => [m.name, ...m.aliases])])].slice(0, 100),
      ...(voiceFocus && voice_focus ? { voice_focus, voice_focus_threshold } : {}),
    },
    output: config.output,
  };
}
