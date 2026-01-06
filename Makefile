.PHONY: setup dev build lint format check clean help

# Install dependencies and set up git hooks
setup:
	bun install

# Run development server
dev:
	bun run dev

# Build for production
build:
	bun run build

# Run ESLint
lint:
	bun run lint

# Fix linting issues
lint-fix:
	bun run lint:fix

# Format code with Prettier
format:
	bun run format

# Check formatting without writing
format-check:
	bun run format:check

# Run TypeScript type checking
typecheck:
	bun run typecheck

# Run all checks (typecheck, lint, format)
check:
	bun run check

# Preview production build locally
preview:
	bun run preview

# Clean build artifacts
clean:
	rm -rf dist node_modules

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make setup       - Install dependencies and git hooks"
	@echo "  make dev         - Run development server"
	@echo "  make build       - Build for production"
	@echo "  make lint        - Run ESLint"
	@echo "  make lint-fix    - Fix linting issues"
	@echo "  make format      - Format code with Prettier"
	@echo "  make format-check - Check formatting"
	@echo "  make typecheck   - Run TypeScript type checking"
	@echo "  make check       - Run all checks (typecheck, lint, format)"
	@echo "  make preview     - Preview production build"
	@echo "  make clean       - Remove build artifacts and node_modules"
