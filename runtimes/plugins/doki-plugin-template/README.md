# {{fullName}}

{{description}}

## Structure

```
plugin-template/
├── package.json       # NPM package configuration
├── src/
│   └── index.ts       # Plugin entry point
├── tests/
│   └── index.test.ts  # Plugin tests
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## Usage

1. Copy this directory and rename it to your plugin name
2. Update `package.json` with your plugin details
3. Update `src/index.ts` with your plugin implementation
4. Add your tests in `tests/`
5. Build with `pnpm build`
6. Test with `pnpm test`

## Plugin Interface

```typescript
interface Plugin {
  name: string;
  version: string;
  description?: string;
  hooks: {
    onBeforeBuild?: (context: HookContext) => Promise<HookResult>;
    onAfterBuild?: (context: HookContext) => Promise<HookResult>;
    onBeforeRender?: (context: HookContext) => Promise<HookResult>;
    onAfterRender?: (context: HookContext) => Promise<HookResult>;
  };
}
```

## Available Hooks

- `onBeforeBuild`: Called before the build starts
- `onAfterBuild`: Called after the build completes
- `onBeforeRender`: Called before rendering each page
- `onAfterRender`: Called after rendering each page

## Hook Context

The `HookContext` provides access to:
- `config`: Site configuration
- `pages`: All pages
- `content`: Current content (for render hooks)

## Hook Result

Return an object with:
- `continue: boolean`: Whether to continue processing
- `data?: any`: Optional data to pass to next hooks

## License

MIT
