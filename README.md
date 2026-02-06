# Metaformalism Copilot

A workspace for transforming insights, smells and ideas from source materials(ex: conversations, text, etc) into personalized, context-sensitive formalisms.

## What is this?

Metaformalism Copilot is an extension of the [Live Conversational Threads](https://www.lesswrong.com/posts/uueHkKrGmeEsKGHPR/live-conversational-threads-not-an-ai-notetaker-2) research project. Rather than producing unified, context-independent theories, this tool helps generate **pluralistic formalisms** - multiple rigorous representations of the same insight, each tailored to the specific context where it will be used.

### The Philosophy: Live Theory

Instead of generalizing via exclusion (finding what's common and discarding the rest), Live Theory proposes **generalization via inclusion** - acknowledging that abstract concepts may need different formal representations in different contexts. This tool:

- Treats post-rigorous insights as first-class artifacts worthy of formalization
- Enables human-centered AI interaction that supports discernment rather than passive consumption
- Produces formalisms that are sensitive to the local context and research interests of the user
- Emphasizes **iterative improvement** and a **bidirectional approach** - you shape the output through refinement rather than passively accepting what's generated

### How it works

The interface supports a collaborative, iterative workflow:

- **Left Panel**: Enter source material (insights, research notes, conceptual material) and describe the theoretical context or domain for formalization. Refine your context description iteratively before generating output.
- **Right Panel**: View the generated formalism and actively shape it through AI-assisted editing:
  - Edit selected portions with inline instructions
  - Transform the entire output with high-level directives
  - Manual editing combined with AI suggestions

This bidirectional approach ensures you remain an active participant in the formalization process, not a passive consumer of AI output.

Built with Next.js, TypeScript, and Tailwind CSS.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## How to Contribute

We welcome contributions! Please follow these guidelines:

### Pull Request Workflow

1. **Create a branch** for your feature or fix
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the existing code structure

3. **Test your changes** locally with `npm run dev`

4. **Commit your changes** with clear, descriptive messages
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

5. **Push your branch** and create a Pull Request
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Do NOT commit directly to main** - all changes must go through Pull Requests

### Code Guidelines

- Follow the existing folder structure in `app/components/features/`
- Use TypeScript for all new components
- Use Tailwind CSS for styling (CSS variables in `globals.css`)
- Add JSDoc comments for complex functions
- Keep components modular and focused on a single responsibility
- Test your changes across different screen sizes

### Before Submitting

- Ensure `npm run lint` passes without errors
- Verify the UI works in both light backgrounds
- Check that all imports use the correct paths
- Remove any console.logs or debug code

## Project Documentation

For detailed documentation, see the [`documentation/`](./documentation) folder:

- [BACKGROUND.md](./documentation/BACKGROUND.md) - Theoretical foundation, Live Theory philosophy, and research context
- [ARCHITECTURE.md](./documentation/ARCHITECTURE.md) - Technical structure, component hierarchy, and implementation details

## Questions or Issues?

Feel free to open an issue for bugs, feature requests, or questions about the codebase.

## License

Need to figure this out
