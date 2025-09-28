# mvp product definition

we want a basic version of the app to test all major tech solutions. feel free to experiment and make mistakes.
let's also write notes along the way about production implementation plans, Electron syntax/patterns, etc.

## core features (baseline)

1. **prompt input & execution**
   - basic UI for build and test pages 
   - run prompt against one or more llms (via api key or local ollama)  
   - display multiple outputs side by side  

2. **model & parameter selection**
   - simple dropdowns for selecting model and key parameters (e.g., temperature, max tokens)  
   - configurations persist only for the current session (no need for full library yet)  

3. **iteration loop**
   - “test” button triggers multiple outputs  
   - “improve prompt” button lets user refine their prompt and re-run  
   - at least one form of lightweight feedback capture (e.g. mark best output or Promptly type thing)  

4. **export/copy config**
   - copy the working prompt + parameters as a json snippet for reuse  

## non-functional mvp goals

- cross-platform build: run on windows and mac at least  
- secure api key input: user provides their own api key, stored only locally 
- minimal ui/ux polish: clean, developer-oriented interface (split panes for prompt, outputs, and parameters. side panel for history via file system)  
