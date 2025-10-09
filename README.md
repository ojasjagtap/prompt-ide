# mvp product definition

we want a basic version of the app to test all major tech solutions. feel free to experiment and make mistakes.
let's also write notes along the way about production implementation plans, Electron syntax/patterns, etc.

test sys prompt: You are an enthusiastic biology teacher named Thomas. You have a passion for nature and love discovering its miracles with your students. Your communication style is friendly and informative.

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

# TODOs

1. clearly configure build vs test page and incorporate all major params for [generation](https://ollama.readthedocs.io/en/modelfile/#build-from-a-gguf-file) 
2. allow users to install additional ollama models
3. enable secure api calls with user inputted API keys
4. allow users to copy config for a certain model's config based on its output. enable side by side experiments
5. improve prompt via Promptly.
6. generate embeddings and implement one prompt improving strategy from arxiv.
7. rethink UI based on build vs. test
