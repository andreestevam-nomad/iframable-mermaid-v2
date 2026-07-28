# Mermaid Share

App estática para escrever diagramas Mermaid, gerar uma URL compactada (`?d=` + `?t=`) e compartilhar a visualização.

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
