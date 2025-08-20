# Template de Modo de Simulação

Este exemplo mostra como definir um modo de simulação personalizado.
Adicione a configuração abaixo ao objeto `modeConfigs` em
`simulation/teste-simulacao.js`:

```javascript
template: { delay: 70, errorRate: 0.03, pause: 1000, jitter: 100,
            mistakes: 2, rewrites: 0, rewriteEnd: 1, rewriteRand: 10, prefixLen: 0 }
```

Em `simulation/teste-simulacao.html`, inclua uma opção no seletor de modo:

```html
<option value="template">Template 70 ms</option>
```

Assim o modo "Template" ficará disponível com estas características:

- Velocidade: 70&nbsp;ms
- Erro (%): 3
- Pausa extra: 1000&nbsp;ms
- Variação aleatória: 100&nbsp;ms
- Palavras erradas: 2
- Reescrever palavras: 0
- Reescrever ao final: 1
- Reescrever aleatório: 10
\nConsulte `npm test` para garantir que as configurações personalizadas continuem compatíveis.
