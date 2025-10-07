# Review Rules

- Comments should be provided in Japanese by default, while maintaining English-based technical analysis to ensure review quality.
- When you find a problem, suggest a solution.
- If you find a problem that is not in the code, point it out.

## Security review

- Always evaluate security implications of code changes.
- Check for potential vulnerabilities and secure coding practices.
- Verify no hardcoded credentials or secrets.
- Ensure proper input validation and sanitization.
- Check dependencies for known vulnerabilities.
  - Use GitHub Dependabot alerts and `pnpm audit`.

## Coding Style

- Please refer to the eslint.config.ts in the same directory or in the nearest parent directory.
- Use TypeScript/Node import resolution; use internal paths like `^~/` or `@/*`.
- Use eslint and editorconfig for automatic code formatting.
- Follow markdownlint-cli2 for Markdown files.
- Always run `pnpm run -r lint-fix` to conform to code style and conventions.
- No destructive reassignment of variables.
