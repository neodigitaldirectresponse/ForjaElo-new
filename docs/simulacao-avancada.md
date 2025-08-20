# Simulação Avançada de Digitação

Este documento descreve ideias para aprimorar o simulador de digitação da extensão.

## 1. Coleta de Dados e Calibração
- **Dataset de referência**: utilize bases públicas de *keystroke dynamics* (por exemplo, o [CMU Keystroke Dataset](https://www.cs.cmu.edu/~keystroke/)) para extrair distribuições reais de IKI (inter‑keystroke interval) e padrões de erro.
- **Profiling inicial**: faça o usuário (ou um algoritmo) digitar um texto de 200–300 caracteres para calibrar média, desvio padrão e taxa de erro.

## 2. Aprendizado Contínuo
- **Feedback loop**: conforme o simulador gera a digitação e recebe análises (por exemplo, comparações com padrões humanos), ajuste a média e a variância dos atrasos usando algoritmos online como a média móvel exponencial.
- **Clusters de perfil**: agrupe estilos distintos de digitação com técnicas de clustering (K‑means, GMM) e permita alternar dinamicamente entre eles.

## 3. Comportamentos Avançados
- **Uso de dicionário/auto‑completar**: introduza pausas maiores antes de palavras longas ou raras, imitando a consulta a um "dicionário mental".
- **Digitação cega vs. olhando**: em inícios de frases ou títulos, inclua atraso extra (até 800 ms) para simular a busca visual das teclas.
- **Multi‑tasking**: insira micro‑pausas aleatórias (50–200 ms) no meio das frases, simulando distrações ocasionais.

## 4. Validação Estatística
- **Testes de aderência**: compare histogramas de IKIs gerados com os do dataset real (testes Kolmogorov–Smirnov ou Qui‑quadrado).
- **Métricas monitoradas**: palavras por minuto (WPM), erros por mil caracteres, distribuição de pausas acima de 300 ms e formatos de *burst* (número médio de teclas entre pausas).


## 5. Teste em múltiplos cenários
O arquivo `simulation/teste-simulacao.html` oferece uma interface para exercitar o simulador em vários modos. Além dos três cenários de texto (técnico, conversa e código), é possível escolher o modo de digitação **Instantâneo**, **Comum**, **Híbrida**, **Robusta**, **Reescrever Aleatório** ou **Imitador**. Os sliders permitem ajustar velocidade, taxa de erro, pausas extras e agora também o tamanho do prefixo usado na modalidade híbrida. Um controle adicional **Reescrever Aleatório** define quantas palavras serão reescritas em um trecho aleatório. Consulte o log gerado com timestamps para cada evento.
A partir desta versão, um campo **Repetições** permite executar o mesmo cenário várias vezes (até 100) para testes prolongados.

## 6. Detecção de Anomalias e Modo Imitador

- **Ajuste dinâmico**: agora o simulador monitora os IKIs em tempo real. Se a média ou o desvio padrão se afastarem mais de 30% do alvo, os valores são suavemente recalibrados.
- **Modo "Imitador"**: forneça uma amostra curta de digitação humana e o simulador aprende média e desvio a partir dela. As mensagens enfileiradas passam a ser digitadas seguindo esse padrão, adaptando-se automaticamente conforme novas medições são coletadas.
\nPara validar ajustes no simulador, utilize `npm test` e garanta que todos os testes passem.
