# CLAUDE.md — Contexto do Projeto Amic Web

## Visão Geral

Amic é um companheiro de IA interativo que roda no browser. O usuário conversa com um robô animado (SVG + Three.js) que tem personalidade, emoções, memória persistente e pode aprender fatos. Autenticação por sessão Rails, estado do robô salvo por usuário no banco.

## Stack

- **Backend:** Rails 8, SQLite, Puma, Kamal (deploy via Docker)
- **Frontend:** Vanilla JS ES modules (sem bundler), importmap, Three.js, face-api.js (TensorFlow.js local)
- **IA:** Anthropic Claude API (browser direto via `anthropic-dangerous-direct-browser-access`) + Groq API (free tier)
- **Voz:** ElevenLabs TTS (opcional) com fallback para Web Speech Synthesis API
- **Câmera/Rosto:** face-api.js rodando localmente, modelos em `/public/models/`

---

## Arquitetura JS (Frontend)

Todos os módulos estão em `public/js/`. Não há build step — ES modules puros.

| Módulo | Responsabilidade |
|---|---|
| `robot.js` | Orquestrador principal. Gerencia estado, delega para todos os outros módulos. Exporta `handleUserMessage`, `initRobot`, `startSleep`, `wakeUp` |
| `ai.js` | Chamadas às APIs de IA. Exporta `askBip` (Claude Haiku), `askGroqSpontaneous`, `askGroqLearning` |
| `memory.js` | Estado persistente do robô. Sync com backend via `/api/amic_state` a cada 1.5s. Exporta `loadMemory`, `saveMemory`, `initMemory`, `addFact`, `getAllFacts` |
| `emotion.js` | Sistema de emoção (0–100 pts) e stamina (0–100). Define eventos e seus impactos. Exporta `applyEvent`, `getEmotionState`, `detectIntent` |
| `face.js` | Render SVG do robô com Three.js. Expressões, movimento, LEDs. Exporta `setExpression`, `playExpression`, `setWalkIntent` |
| `voice.js` | TTS (ElevenLabs ou Web Speech) + STT (Web Speech Recognition). Exporta `speak`, `listen`, `listenPTT` |
| `sandbox.js` | Executa código JS gerado pela IA em sandbox seguro. Gerencia biblioteca de ações/expressões aprendidas. Exporta `executeSandboxCode`, `getCodeLibrary` |
| `learn.js` | Detecta pedido de aprendizado ("aprenda sobre X"). Exporta `detectLearnRequest`, `learnAbout` |
| `logger.js` | Log centralizado de atividade (info/warn/error). Persiste em sessionStorage. Emite evento `amic:log`. Exporta `logInfo`, `logWarn`, `logError`, `getLogs`, `clearLogs` |
| `vision.js` | Detecção facial via face-api.js (local, sem API externa). Exporta `analyzeFrame`, `findBestMatch` |
| `weather.js` | Clima via Open-Meteo (100% grátis). Afeta emoção do robô |
| `battery.js` | Monitora bateria do dispositivo via Battery API. Afeta stamina |
| `rails_api.js` | Funções para criar/salvar sessões de conversa no backend Rails |

---

## Backend Rails

### Modelos principais

- `User` — autenticação com bcrypt. `has_one :amic_state`
- `AmicState` — estado do robô por usuário. Campos: `state_data` (JSON), `code_library` (JSON)
- `ChatSession` + `Message` — histórico de conversas
- `FaceProfile` — perfis faciais reconhecidos pela câmera
- `Setting` — configurações globais (ex: chave API do servidor)

### Controllers relevantes

- `Api::AmicStatesController` — GET/PATCH `/api/amic_state`. Persiste `state_data` e `code_library`
- `HistoryController` — lista e exibe sessões; POST `#analyze` chama `ClaudeService` para análise
- `HomeController` — serve a SPA principal

### Serviços

- `app/services/claude_service.rb` — analisa sessão de conversa via Claude. Chamado apenas manualmente pelo usuário (não automático)

---

## Estado do Robô (`state_data`)

Campos relevantes persistidos por usuário:

```
name, birthDate, emotionPoints (0-100), stamina (0-100)
memory: { short_term[], medium_term[], long_term[] }  ← fatos aprendidos em tiers
skills: { communication, creativity, problem_solving, curiosity, empathy }
weaknesses: { laziness, ignorance, indecision, stubbornness }
conversationHistory[]  ← últimas 50 mensagens
totalTalkMinutes
apiKey          ← chave Claude (salva no estado do usuário)
groqApiKey      ← chave Groq (salva no estado do usuário)
elevenLabsApiKey, elevenLabsVoiceId
voiceName, voiceRate, voiceLang
showDebug
```

---

## Fluxo de IA

### Conversa principal
`handleUserMessage` → `askBip` (Claude Haiku) com streaming SSE

### Pensamentos espontâneos (5–20 min)
`robot.js:doSpontaneousThought` → `askGroqSpontaneous` (Groq, fallback Claude)

### Aprendizado de tópico ("aprenda sobre X")
`robot.js:handleUserMessage` → `askGroqLearning` (Groq, fallback `askBip`) → JSON com fatos → `addFact`

### Análise de sessão
`HistoryController#analyze` → `ClaudeService` (backend, manual)

---

## Formato de Resposta do Claude

O Claude retorna:
1. `[EXPR:NOME]` — expressão facial (sempre primeiro)
2. Texto da resposta (máx 2 frases)
3. `[CODE]...[/CODE]` — JS para modificar aparência (opcional)
4. `{"learned": [...], "dreamEmojis": [...]}` — JSON ao final

Parsing feito em `ai.js:askBip` com regex.

---

## Estágios de Desenvolvimento do Robô

Definidos em `robot.js:STAGES`:

| Estágio | Min. minutos | Min. fatos (long+medium) |
|---|---|---|
| NEWBORN 🍼 | 0 | 0 |
| CHILD 🌱 | 60 | 10 |
| TEEN 🌿 | 300 | 40 |
| ADULT 🌳 | 900 | 80 |

---

## APIs Externas

| Serviço | Uso | Custo | Chave |
|---|---|---|---|
| Anthropic Claude Haiku | Conversa principal | Pago (~$0.25/M tokens) | `state.apiKey` |
| Groq / llama-3.3-70b-versatile | Pensamentos espontâneos + aprendizado | **Grátis** (14.400 req/dia) | `state.groqApiKey` |
| ElevenLabs TTS | Voz expressiva | Opcional/Pago | `state.elevenLabsApiKey` |
| Piper TTS (local) | Narração offline pt-BR, sem custo | **Grátis** (roda no servidor) | — |
| Open-Meteo | Clima | **Grátis** | — |
| Web Speech API | STT + TTS fallback | **Grátis** (browser) | — |
| face-api.js | Detecção facial | **Grátis** (local) | — |

---

## Changelog

### 2026-07-07 — Voz Local Grátis (Piper TTS)

- **Novo:** [Piper TTS](https://github.com/rhasspy/piper) integrado como narração local, offline e gratuita em pt-BR (voz `pt_BR-faber-medium`), alternativa ao ElevenLabs sem custo por caractere
  - `bin/download_piper` — baixa binário + modelo de voz para `vendor/piper/` (gitignorado; baixado também durante o build da imagem Docker)
  - `app/services/piper_tts_service.rb` — roda o binário via `Open3`, retorna WAV
  - `app/controllers/api/tts_controller.rb` — `POST /api/tts/piper { text }` → áudio `audio/wav`
- **Modificado:** `voice.js` — nova `_speakPiper`; `speak()` agora prioriza Piper (se `usePiperTts` ativo) → ElevenLabs → TTS do sistema, com fallback em cascata
- **Modificado:** `memory.js` — campo `usePiperTts` no estado padrão, preservado no `resetMemory`
- **Modificado:** `app/views/home/index.html.erb` — toggle "Voz local (Piper TTS)" no painel de configurações
- **Modificado:** `Dockerfile` — baixa Piper (binário + voz) durante o build, para produção já sair com narração local pronta

### 2026-04-27 — Log de Atividade e Melhoria de Erros

- **Novo:** `public/js/logger.js` — módulo centralizado de logging (info/warn/error)
  - Persiste em `sessionStorage`, max 200 entradas, emite evento `amic:log`
  - Exporta: `logInfo`, `logWarn`, `logError`, `getLogs`, `clearLogs`
- **Modificado:** `ai.js` — log de cada chamada Claude e Groq com modelo, mensagem, erros detalhados
- **Modificado:** `voice.js` — log de chamadas ElevenLabs; erro agora extrai `detail.message` do JSON da API; fallback para TTS do sistema com log de aviso
- **Modificado:** `app/views/home/index.html.erb` — nova seção "Log de Atividade" no painel debug com atualização em tempo real e botão Limpar

### 2026-04-26 — Redução de Custos (~95%)

- **Novo:** Suporte a Groq (free tier) em `ai.js`: `askGroqSpontaneous`, `askGroqLearning`
- **Modificado:** `ai.js` — Claude Sonnet → **Claude Haiku** (`claude-haiku-4-5-20251001`); system prompt dividido em `_buildStaticPrompt` (cacheável) + `_buildDynamicPrompt`; **prompt caching** ativado via `anthropic-beta: prompt-caching-2024-07-31`
- **Modificado:** `robot.js` — pensamentos espontâneos usam Groq primeiro (fallback Claude); intervalo aumentado de 1–6 min → **5–20 min**; aprendizado de tópicos usa Groq quando chave disponível
- **Modificado:** `memory.js` — campo `groqApiKey` adicionado ao estado padrão; preservado no `resetMemory`
- **Modificado:** `app/views/home/index.html.erb` — campo "Chave da API Groq" no painel de configurações
- **Modificado:** `voice.js` — ElevenLabs com fallback automático para TTS do sistema em caso de erro (era crash)

### 2026-04-25 — Persistência de Estado no Backend

- **Novo:** `app/models/amic_state.rb` + migração — estado do robô persistido por usuário no banco
- **Novo:** `app/controllers/api/amic_states_controller.rb` — GET/PATCH `/api/amic_state`
- **Modificado:** `memory.js` — `initMemory` faz GET no backend; sync automático a cada 1.5s; migração de localStorage → banco na primeira vez
- **Modificado:** `memory.js:resetMemory` — preserva chaves de API (Claude, ElevenLabs) no reset

### 2026-04-25 — Funcionalidades Principais (commits anteriores)

- Sistema de emoção e stamina com decay temporal (`emotion.js`)
- Estágios de desenvolvimento do robô (NEWBORN → ADULT)
- Live coding: robô pode escrever JS para modificar própria aparência (`sandbox.js`)
- Câmera + reconhecimento facial (`vision.js`, `face-api.js` local)
- Aprendizado de tópicos com extração de fatos estruturados
- Histórico de sessões com análise via Claude (`history_controller.rb`, `claude_service.rb`)
- Sistema de memória em 3 tiers (short/medium/long term) com promoção por reforço
- Pensamentos espontâneos e ciclo de sono/acordar
- Painel de debug com estado completo, memórias, código aprendido e conversa recente
