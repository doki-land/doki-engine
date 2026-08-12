# {{fullName}}

{{description}}

## Structure

```
theme-template/
├── package.json       # NPM package configuration
├── theme.toml         # Theme metadata and configuration
├── templates/         # HTML templates
│   ├── layout.html    # Base layout template
│   ├── index.html     # Homepage template
│   └── page.html      # Single page template
├── static/            # Static assets
│   └── css/
│       └── style.css  # Default stylesheet
├── shortcodes/        # Custom shortcodes
│   └── example.html   # Example shortcode
└── README.md          # This file
```

## Usage

1. Copy this directory and rename it to your theme name
2. Update `package.json` with your theme details
3. Update `theme.toml` with your theme configuration
4. Customize templates in `templates/`
5. Add your styles in `static/css/`
6. Create custom shortcodes in `shortcodes/`

## Templates

### layout.html

The base layout template that all other templates extend. It includes:
- HTML document structure
- Head section with meta tags and stylesheet
- Header with navigation
- Main content area
- Footer

### index.html

The homepage template that displays a list of pages.

### page.html

The single page template for displaying individual content pages.

## Shortcodes

Shortcodes are reusable content blocks that can be inserted into markdown files.

Example usage in markdown:

```markdown
{{< example >}}
Custom content here
{{< /example >}}
```

## License

MIT
