set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load
set allow-duplicate-recipes

run := "bun run"
install_cmd := "bun install --frozen-lockfile"
update_cmd := "bun update"
clean_paths := "dist"

import '.common/just/web.just'

# List available recipes.
default:
    @just --list

# Install dependencies and set up git hooks.
[group('project')]
setup: install

# Fix lint violations automatically.
[group('project')]
lint-fix:
    {{ run }} lint:fix
