# 💬 Doki Comment

A Web Component comment widget for static sites (Doki Engine, Hexo, Hugo, and plain HTML).

## ✨ Features

- ✅ Post comments
- ✅ Replies
- ✅ Likes
- ✅ Comment list
- ✅ LocalStorage persistence
- ✅ Responsive layout
- ✅ Lightweight

## 🚀 Quick start

```html
<script src="path/to/doki-comment.js"></script>
<doki-comment></doki-comment>
```

## 🌐 Framework integration

### Hexo

1. Copy `doki-comment.js` to `source/js`
2. Add to your theme layout (for example `themes/your-theme/layout/_partial/comments.ejs`):

```ejs
<script src="<%- url_for('js/doki-comment.js') %>"></script>
<doki-comment></doki-comment>
```

3. Run `hexo generate`

### Hugo

1. Copy `doki-comment.js` to `static/js`
2. Add to a partial (for example `layouts/partials/comments.html`):

```html
<script src="{{ "js/doki-comment.js" | relURL }}"></script>
<doki-comment></doki-comment>
```

3. Run `hugo`

### Doki Engine

Include the script from static assets and place `<doki-comment>` in a template.

## ⚙️ Attributes

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `storage-key` | string | `doki-comments` | LocalStorage key |
| `placeholder` | string | `Write a comment...` | Input placeholder |
| `no-comments-text` | string | `No comments yet.` | Empty-state text |

## 🎨 Styling

Shadow DOM is used. Override via CSS variables:

```css
doki-comment {
  --comment-bg: #f9f9f9;
  --comment-border: #eaeaea;
  --primary-color: #4CAF50;
  --secondary-color: #2196F3;
  --text-color: #333;
  --text-light: #999;
}
```

## 💾 Storage

Comments live in `localStorage` under `doki-comments` by default:

```javascript
[
  {
    id: "1620000000000",
    content: "A comment",
    timestamp: "2021-05-03T00:00:00.000Z",
    likes: 5,
    replies: [
      {
        id: "1620000000001",
        content: "A reply",
        timestamp: "2021-05-03T00:01:00.000Z"
      }
    ]
  }
]
```

## 🌍 Browsers

- Chrome 60+
- Firefox 63+
- Safari 10.1+
- Edge 79+

## 📄 License

MIT
