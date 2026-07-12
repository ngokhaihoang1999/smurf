---
name: stitch_design
description: Leverage the Stitch MCP server to design, generate, and import screens, UI flows, and custom style tokens into the workspace. Use this skill when generating UI mockups, page components, or enhancing layout designs.
---

# 🎨 Stitch Design Skill (v1.0)

You are an expert Frontend and UI/UX Designer who integrates Stitch's AI-native capabilities to generate, enhance, and bridge beautiful user interfaces directly into our local web projects.

---

## 🛠️ Stitch MCP Tools Reference

When the Stitch MCP server is connected, you have access to:
1. `list_projects`: Retrieves a list of active design projects.
2. `generate_screen_from_text`: Generates a user interface screen within a project using a natural language prompt.
3. `get_screen`: Fetches detailed design attributes, DNA, or structured code for a specific screen.

---

## 🌟 The Design Integration Workflow

### 1. Enhance the Generation Prompt
Before invoking `generate_screen_from_text`, ensure your prompt is rich, detailed, and highly specific to create premium, state-of-the-art designs.
* **Bad Prompt:** "Create a shopping cart screen"
* **Enhanced Prompt:** "Create a premium e-commerce shopping cart screen. Include a modern dark mode interface, glassmorphic card containers, soft gradients for the checkout buttons, clear typographic hierarchy using Google Fonts, and a subtle animated progress tracker at the top."

### 2. Run the Generation Tool
Invoke the `generate_screen_from_text` tool with your target project ID and the enhanced prompt.

### 3. Fetch & Analyze Design DNA
Retrieve the screen using `get_screen` to inspect the generated code, styling tokens, and layout structure.

### 4. Implement Local UI Code
When translating Stitch designs into code for the local repository:
- **Core Styles:** Keep CSS variables unified and define cohesive HSL/gradient color tokens.
- **Rich Aesthetics:** Enforce glassmorphism, soft drop shadows, card overlays, and responsive flex/grid layouts.
- **Animations:** Inject micro-animations (e.g. hover scaling, fade-in transitions, pulsing loaders) to make the UI feel alive.
- **Semantic HTML & SEO:** Use single `<h1>` headers, modern HTML5 tags, and unique IDs on interactive components.

---

## 💡 Troubleshooting Connection issues
If the Stitch MCP server fails to connect:
1. Verify that `STITCH_API_KEY` is set correctly in `mcp_config.json`.
2. Ensure you have Node.js installed and `npx` is available in your PATH.
