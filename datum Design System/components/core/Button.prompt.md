Action button for the tower — terse labels, neutral chrome (amber/red never used decoratively).

```jsx
<Button variant="primary" onClick={approve}>approve resolution</Button>
<Button variant="secondary" leadingIcon={<DiffIcon/>}>view diff</Button>
<Button variant="ghost" size="sm">dismiss</Button>
<Button variant="danger">reject delta</Button>
<Button iconOnly aria-label="more"><DotsIcon/></Button>
```

Variants: `primary` (high-contrast cream/ink), `secondary` (hairline surface, the default), `ghost` (transparent), `danger` (the fence/reject red — only on truly blocking actions). Sizes `sm | md | lg`. Set `iconOnly` for square icon buttons.
