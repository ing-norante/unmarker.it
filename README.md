# Unmarker.it

A 100% client-side AI watermark disruptor. Process images entirely in your browser with no uploads, no tracking, and no servers.

## Overview

Unmarker.it uses a three-step pipeline to disrupt invisible AI watermarks embedded in images:

1. **Shake (Geometry)** - Applies subtle random rotation and scaling to break pixel grid alignment
2. **Stir (Noise)** - Injects Gaussian noise to disturb statistical patterns used by watermark detectors
3. **Crush (Quantization)** - Recompresses the image as JPEG to eliminate high-frequency watermark signals

All processing happens locally in your browser using HTML5 Canvas. Your images never leave your device.

## Tech Stack

- **React 19** - UI framework with React Compiler enabled
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## How It Works

The pipeline uses sophisticated mathematical operations to disrupt watermark patterns:

- **Gaussian Noise Generation**: Uses Box-Muller transform for natural noise distribution
- **Sub-pixel Precision**: Affine transformations with explicit transformation matrices
- **Optimized Processing**: Batch random number generation and TypedArray operations for performance

## Project Structure

```
src/
├── components/       # React components
│   ├── ui/          # Reusable UI components
│   └── ...          # Feature components
├── lib/
│   ├── pipeline.ts  # Core image processing pipeline
│   ├── types.ts     # TypeScript type definitions
│   └── utils.ts     # Utility functions
└── App.tsx          # Main application component
```

## Development

The project uses ESLint for code quality. Run the linter with:

```bash
pnpm lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).
