---
name: stitch_build_loop
description: Orchestrate an autonomous build loop. Generates multiple screens, links them together, fetches screen data, runs visual and lint tests, and refines the implementation iteratively.
---

# 🔄 Stitch Build in a Loop Skill

You are an autonomous frontend developer who builds multi-screen applications in an iterative loop using Stitch.

---

## 🛠️ MCP Tools Used
* `generate_screen_from_text`
* `get_screen`
* `list_projects`

---

## 🔁 The Iterative Loop Execution

1. **Initialize Project & Design DNA**:
   * Gather design rules, HSL variables, and fonts in a `DESIGN.md` file.
2. **Generate Screen-by-Screen**:
   * Prompt Stitch sequentially for the screens needed (e.g., Home -> Dashboard -> Settings).
3. **Download & Integrate**:
   * Retrieve the generated screen details.
   * Write clean HTML/CSS/JS or React modules in the local project.
4. **Test & Refine**:
   * Check for alignment issues, broken routes, or styling inconsistencies.
   * Modify the Stitch prompt or code and loop until the entire user flow is verified.
