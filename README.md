# DiagShare

App estática para escrever diagramas Mermaid, gerar uma URL compactada (`?d=` + `?t=` + opcional `?th=` / `?mmd=` / `?z=` / `?zs=` / `?zx=` / `?zy=`) e compartilhar a visualização.

No editor, o dropdown **Tema** escolhe o visual do Mermaid (`neutral` por padrão; também `default`, `forest`, `dark`, `base`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`). Temas diferentes de `neutral` entram na URL como `?th=`. Usa Mermaid **11.16.0**.

Na view compartilhada, `?z=1` liga o modo zoom/pan e `?z=0` (ou ausência de `z`) deixa desligado — o botão “Modo zoom” atualiza esse parâmetro. Com o zoom ligado, a URL também guarda a escala (`zs`) e o centro da vista no diagrama (`zx`, `zy`), para o link compartilhar a mesma posição.

O código Mermaid fica abaixo dos botões: `?mmd=hide` (padrão) mantém a área quase invisível (ainda no DOM para exportar a página); `?mmd=show` expande o painel com syntax highlight. O botão “Ver código Mermaid” alterna esse estado.

No editor, o preview também tem **Modo zoom** e o checkbox **Mostrar código mmd** (default desligado). Ambos entram na URL gerada (`?z=1`, `?zs/zx/zy`, `?mmd=show`).

## Uso local

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`. As URLs geradas apontam para o site em produção (GitHub Pages), não para localhost.

## Produção

Site: https://andreestevam-nomad.github.io/iframable-mermaid-v2/

### Deploy (GitHub Actions)

O workflow `.github/workflows/deploy-pages.yml` publica o site em todo push na `main`.

No repositório GitHub:

1. **Settings → Pages → Build and deployment → Source:** GitHub Actions
2. Faça push na `main` (ou rode o workflow manualmente em **Actions**)

## Estrutura

- `index.html` — editor, preview e visualização compartilhada
- `renderer.html` — iframe isolado do Mermaid
- `js/` — app, editor (CodeMirror), compressão
- `css/` — estilos
