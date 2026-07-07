#!/usr/bin/env bash
# ==============================================================================
# setup_completo.sh — Instalador "super" do Amic Web
# ==============================================================================
#
# Instala, na ordem correta, tudo que o projeto precisa para rodar em dev:
#   1. Pacotes de sistema (compilador, headers do sqlite3/yaml, git, curl...)
#   2. Gerenciador de versão de Ruby (rbenv > rvm > pacote do SO)
#   3. Ruby na versão exigida por .ruby-version
#   4. Bundler na versão exigida pelo Gemfile.lock
#   5. Gems do projeto (bundle install)
#   6. Banco de dados (db:prepare)
#   7. Limpeza de logs/tmp
#   8. Modelos de reconhecimento facial (face-api.js) — opcional
#
# Cada etapa tem 1ª opção, 2ª opção (rescue) e, se tudo falhar, registra o erro
# e SEGUE para a próxima etapa (não aborta o script inteiro por um item).
# Ao final é impresso um resumo e um log completo fica salvo em log/setup_*.log
#
# Uso:
#   ./script/setup_completo.sh                 # instala tudo, pergunta antes de passos sensíveis
#   ./script/setup_completo.sh --yes           # não pergunta nada (modo CI/automático)
#   ./script/setup_completo.sh --skip-models   # não baixa os modelos de face-api.js
#   ./script/setup_completo.sh --start         # ao final, sobe o servidor (bin/dev)
# ==============================================================================

set -uo pipefail

# ------------------------------------------------------------------ contexto -
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT" || exit 1

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$APP_ROOT/log"
LOGFILE="$APP_ROOT/log/setup_${TIMESTAMP}.log"
touch "$LOGFILE"

ASSUME_YES=0
SKIP_MODELS=0
START_SERVER=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --skip-models) SKIP_MODELS=1 ;;
    --start) START_SERVER=1 ;;
  esac
done

REQUIRED_RUBY="$(cat "$APP_ROOT/.ruby-version" 2>/dev/null | tr -d ' \n' | sed 's/^ruby-//')"
REQUIRED_BUNDLER="$(grep -A1 'BUNDLED WITH' "$APP_ROOT/Gemfile.lock" | tail -1 | tr -d ' \n')"

# Resumo de resultados por etapa (para o relatório final)
declare -a STEP_NAMES=()
declare -a STEP_RESULTS=()

# ------------------------------------------------------------------- cores --
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'
else
  C_RESET=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""
fi

# ------------------------------------------------------------------ logging -
log()      { printf "%s [INFO]  %s\n"  "$(date '+%H:%M:%S')" "$*" | tee -a "$LOGFILE"; }
warn()     { printf "%s [WARN]  %s\n"  "$(date '+%H:%M:%S')" "$*" | tee -a "$LOGFILE" >&2; }
error()    { printf "%s [ERROR] %s\n"  "$(date '+%H:%M:%S')" "$*" | tee -a "$LOGFILE" >&2; }
section()  { printf "\n${C_BOLD}${C_BLUE}== %s ==${C_RESET}\n" "$*" | tee -a "$LOGFILE"; }
ok()       { printf "${C_GREEN}✓ %s${C_RESET}\n" "$*" | tee -a "$LOGFILE"; }
fail_msg() { printf "${C_RED}✗ %s${C_RESET}\n" "$*" | tee -a "$LOGFILE"; }

# Executa um comando redirecionando tudo para o log, mas mostrando na tela também
run_logged() {
  echo "+ $*" >> "$LOGFILE"
  # shellcheck disable=SC2068
  eval "$@" >>"$LOGFILE" 2>&1
}

confirm() {
  local prompt="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi
  read -r -p "$prompt [s/N] " reply
  case "$reply" in
    [sSyY]*) return 0 ;;
    *) return 1 ;;
  esac
}

# Registra o resultado de uma etapa para o resumo final
record_step() {
  STEP_NAMES+=("$1")
  STEP_RESULTS+=("$2")
}

# ------------------------------------------------------------- detect os ---
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_ID_LIKE="${ID_LIKE:-}"
  elif [ "$(uname -s)" = "Darwin" ]; then
    OS_ID="macos"
    OS_ID_LIKE=""
  else
    OS_ID="unknown"
    OS_ID_LIKE=""
  fi

  if command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
  elif command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
  elif command -v brew >/dev/null 2>&1; then
    PKG_MGR="brew"
  elif command -v pacman >/dev/null 2>&1; then
    PKG_MGR="pacman"
  else
    PKG_MGR="none"
  fi
  log "Sistema detectado: OS_ID=$OS_ID (like: $OS_ID_LIKE) — gerenciador de pacotes: $PKG_MGR"
}

# --------------------------------------------------- etapa 1: pacotes sist -
install_system_packages() {
  section "Etapa 1/8 — Pacotes de sistema (compilador, sqlite3, yaml, git, curl)"

  case "$PKG_MGR" in
    dnf)
      PKGS="gcc gcc-c++ make git curl pkgconf-pkg-config sqlite sqlite-devel libyaml-devel gnupg2 patch redhat-rpm-config"
      if run_logged "sudo dnf install -y $PKGS"; then
        ok "Pacotes instalados via dnf"
        record_step "Pacotes de sistema (dnf)" "OK"; return 0
      else
        warn "dnf falhou na 1ª tentativa, tentando 'sudo dnf install -y --skip-broken $PKGS' (2ª opção)"
        if run_logged "sudo dnf install -y --skip-broken $PKGS"; then
          ok "Pacotes instalados via dnf (--skip-broken)"
          record_step "Pacotes de sistema (dnf)" "OK (parcial)"; return 0
        fi
      fi
      ;;
    apt)
      if run_logged "sudo apt-get update -qq"; then :; else warn "apt-get update falhou, seguindo mesmo assim"; fi
      PKGS="build-essential git curl pkg-config libsqlite3-dev libyaml-dev gnupg2 patch"
      if run_logged "sudo apt-get install -y $PKGS"; then
        ok "Pacotes instalados via apt"
        record_step "Pacotes de sistema (apt)" "OK"; return 0
      else
        warn "apt falhou na 1ª tentativa, tentando 'apt-get install -y -f' (2ª opção, corrige dependências quebradas)"
        if run_logged "sudo apt-get install -y -f && sudo apt-get install -y $PKGS"; then
          ok "Pacotes instalados via apt (2ª tentativa)"
          record_step "Pacotes de sistema (apt)" "OK (2ª tentativa)"; return 0
        fi
      fi
      ;;
    brew)
      PKGS="sqlite libyaml gnupg pkg-config"
      if run_logged "brew install $PKGS"; then
        ok "Pacotes instalados via brew"
        record_step "Pacotes de sistema (brew)" "OK"; return 0
      else
        warn "brew install falhou, tentando 'brew update && brew install' (2ª opção)"
        if run_logged "brew update && brew install $PKGS"; then
          ok "Pacotes instalados via brew (após update)"
          record_step "Pacotes de sistema (brew)" "OK (2ª tentativa)"; return 0
        fi
      fi
      ;;
    pacman)
      PKGS="base-devel git curl sqlite libyaml gnupg pkgconf"
      if run_logged "sudo pacman -Sy --noconfirm $PKGS"; then
        ok "Pacotes instalados via pacman"
        record_step "Pacotes de sistema (pacman)" "OK"; return 0
      fi
      ;;
    *)
      warn "Nenhum gerenciador de pacotes suportado encontrado (dnf/apt/brew/pacman)."
      ;;
  esac

  error "Não foi possível instalar os pacotes de sistema automaticamente."
  error "Instale manualmente: compilador C, headers do sqlite3 e do libyaml, git, curl."
  record_step "Pacotes de sistema" "FALHOU (instalar manualmente)"
  return 1
}

# --------------------------------------------- etapa 2: gerenciador ruby --
ensure_rbenv() {
  if command -v rbenv >/dev/null 2>&1 && [ -d "$(rbenv root 2>/dev/null)" ]; then
    return 0
  fi

  log "rbenv não encontrado, instalando (1ª opção: git clone oficial)"
  export RBENV_ROOT="${RBENV_ROOT:-$HOME/.rbenv}"
  if [ ! -d "$RBENV_ROOT" ]; then
    run_logged "git clone https://github.com/rbenv/rbenv.git '$RBENV_ROOT'"
  fi
  mkdir -p "$RBENV_ROOT/plugins"
  if [ ! -d "$RBENV_ROOT/plugins/ruby-build" ]; then
    run_logged "git clone https://github.com/rbenv/ruby-build.git '$RBENV_ROOT/plugins/ruby-build'"
  fi
  export PATH="$RBENV_ROOT/bin:$PATH"
  eval "$(rbenv init - bash 2>/dev/null)" 2>/dev/null || true

  if command -v rbenv >/dev/null 2>&1; then
    return 0
  fi

  warn "Clone do rbenv falhou, tentando instalar via gerenciador de pacotes (2ª opção)"
  case "$PKG_MGR" in
    brew) run_logged "brew install rbenv ruby-build" ;;
    dnf)  run_logged "sudo dnf install -y rbenv ruby-build" ;;
    apt)  run_logged "sudo apt-get install -y rbenv" ;;
  esac
  export PATH="$HOME/.rbenv/bin:$PATH"
  command -v rbenv >/dev/null 2>&1
}

install_ruby() {
  section "Etapa 2/8 — Ruby $REQUIRED_RUBY (versão exigida por .ruby-version)"

  CURRENT_RUBY="$(ruby -e 'print RUBY_VERSION' 2>/dev/null || echo "?")"
  log "Ruby atualmente ativo no shell: $CURRENT_RUBY | exigido pelo projeto: $REQUIRED_RUBY"

  if [ "$CURRENT_RUBY" = "$REQUIRED_RUBY" ]; then
    ok "Ruby $REQUIRED_RUBY já é o ativo, nada a fazer"
    record_step "Ruby $REQUIRED_RUBY" "OK (já ativo)"
    return 0
  fi

  if ensure_rbenv; then
    log "Usando rbenv para instalar Ruby $REQUIRED_RUBY (1ª opção)"
    if rbenv versions --bare 2>/dev/null | grep -qx "$REQUIRED_RUBY"; then
      ok "Ruby $REQUIRED_RUBY já instalado via rbenv"
    elif run_logged "rbenv install -s '$REQUIRED_RUBY'"; then
      ok "Ruby $REQUIRED_RUBY instalado via rbenv"
    else
      error "rbenv install falhou para $REQUIRED_RUBY"
      record_step "Ruby $REQUIRED_RUBY" "FALHOU (rbenv install)"
      return 1
    fi
    run_logged "rbenv local '$REQUIRED_RUBY'"
    rbenv rehash 2>/dev/null || true
    export PATH="$RBENV_ROOT/shims:$PATH"
    NEW_RUBY="$(ruby -e 'print RUBY_VERSION' 2>/dev/null || echo "?")"
    if [ "$NEW_RUBY" = "$REQUIRED_RUBY" ]; then
      ok "Ruby ativo agora: $NEW_RUBY"
      record_step "Ruby $REQUIRED_RUBY" "OK (via rbenv)"
      return 0
    fi
    warn "rbenv instalou o Ruby mas o shell ainda não está usando a versão certa (pode exigir novo terminal)"
    record_step "Ruby $REQUIRED_RUBY" "OK, mas requer novo shell (rbenv local ok)"
    return 0
  fi

  warn "rbenv indisponível, tentando rvm (2ª opção)"
  if command -v rvm >/dev/null 2>&1 || { curl -fsSL https://get.rvm.io 2>/dev/null | bash -s stable 2>>"$LOGFILE"; }; then
    # shellcheck disable=SC1090
    source "$HOME/.rvm/scripts/rvm" 2>/dev/null || true
    if run_logged "rvm install '$REQUIRED_RUBY'" && run_logged "rvm use '$REQUIRED_RUBY'"; then
      ok "Ruby $REQUIRED_RUBY instalado via rvm"
      record_step "Ruby $REQUIRED_RUBY" "OK (via rvm)"
      return 0
    fi
  fi

  warn "rvm indisponível/falhou, usando o Ruby do sistema como 3ª opção (pode divergir da versão exigida)"
  error "Ruby do sistema é $CURRENT_RUBY, mas o projeto pede $REQUIRED_RUBY. Bugs sutis podem ocorrer."
  record_step "Ruby $REQUIRED_RUBY" "FALHOU — seguindo com Ruby do sistema ($CURRENT_RUBY)"
  return 1
}

# ------------------------------------------------------ etapa 3: bundler --
install_bundler() {
  section "Etapa 3/8 — Bundler $REQUIRED_BUNDLER (versão travada em Gemfile.lock)"

  if [ -z "$REQUIRED_BUNDLER" ]; then
    warn "Não consegui detectar a versão do bundler em Gemfile.lock, instalando o bundler mais recente"
    if run_logged "gem install bundler"; then
      record_step "Bundler" "OK (última versão)"; return 0
    fi
    record_step "Bundler" "FALHOU"; return 1
  fi

  if gem list bundler -i --version "$REQUIRED_BUNDLER" >/dev/null 2>&1; then
    ok "Bundler $REQUIRED_BUNDLER já instalado"
    record_step "Bundler $REQUIRED_BUNDLER" "OK (já instalado)"
    return 0
  fi

  log "Instalando bundler $REQUIRED_BUNDLER (1ª opção)"
  if run_logged "gem install bundler -v '$REQUIRED_BUNDLER'"; then
    ok "Bundler $REQUIRED_BUNDLER instalado"
    record_step "Bundler $REQUIRED_BUNDLER" "OK"
    return 0
  fi

  warn "Falhou instalar a versão exata, tentando 'gem install bundler --no-document' (2ª opção)"
  if run_logged "gem install bundler -v '$REQUIRED_BUNDLER' --no-document"; then
    ok "Bundler $REQUIRED_BUNDLER instalado (--no-document)"
    record_step "Bundler $REQUIRED_BUNDLER" "OK (2ª tentativa)"
    return 0
  fi

  warn "Ainda falhou, caindo para o bundler mais recente disponível (3ª opção)"
  if run_logged "gem install bundler"; then
    warn "Bundler instalado em versão diferente da travada em Gemfile.lock — 'bundle install' pode reclamar"
    record_step "Bundler $REQUIRED_BUNDLER" "OK (versão diferente instalada)"
    return 0
  fi

  error "Não foi possível instalar o bundler"
  record_step "Bundler" "FALHOU"
  return 1
}

# ---------------------------------------------------- etapa 4: bundle install
run_bundle_install() {
  section "Etapa 4/8 — Instalando gems do projeto (bundle install)"

  if run_logged "bundle check"; then
    ok "Gems já satisfazem o Gemfile.lock"
    record_step "bundle install" "OK (já satisfeito)"
    return 0
  fi

  log "Rodando 'bundle install' (1ª opção)"
  if run_logged "bundle install"; then
    ok "bundle install concluído"
    record_step "bundle install" "OK"
    return 0
  fi

  warn "bundle install falhou, tentando novamente com --retry 3 (2ª opção, comum em falha de rede)"
  if run_logged "bundle install --retry 3"; then
    ok "bundle install concluído na 2ª tentativa"
    record_step "bundle install" "OK (2ª tentativa)"
    return 0
  fi

  warn "Ainda falhou. Verificando se é falta de headers nativos (sqlite3/nokogiri/ffi) — 3ª opção"
  if grep -qi "sqlite3\|libsqlite3\|mkmf\|yaml\|ffi" "$LOGFILE"; then
    warn "Log indica possível falta de biblioteca nativa. Tentando reinstalar dependências de sistema e repetir."
    install_system_packages || true
    if run_logged "bundle install"; then
      ok "bundle install concluído após reinstalar dependências de sistema"
      record_step "bundle install" "OK (após reinstalar deps de sistema)"
      return 0
    fi
  fi

  error "bundle install falhou mesmo após retries. Veja $LOGFILE para o erro completo."
  record_step "bundle install" "FALHOU (ver log)"
  return 1
}

# --------------------------------------------------- etapa 5: credenciais -
check_credentials() {
  section "Etapa 5/8 — Verificando master.key / credenciais"

  if [ -f "$APP_ROOT/config/master.key" ]; then
    ok "config/master.key presente"
    record_step "master.key" "OK"
    return 0
  fi

  if [ -f "$APP_ROOT/config/credentials.yml.enc" ]; then
    warn "config/master.key AUSENTE, mas config/credentials.yml.enc existe."
    warn "Não é possível gerar uma chave nova sem invalidar as credenciais já cifradas."
    warn "Peça a chave a quem já tem acesso ao projeto e salve em config/master.key,"
    warn "ou rode 'bin/rails credentials:edit' para gerar um par novo (substitui o arquivo .enc)."
    record_step "master.key" "AUSENTE (ação manual necessária — ver log)"
    return 1
  fi

  log "Nenhuma credencial cifrada encontrada, nada a fazer aqui"
  record_step "master.key" "N/A"
  return 0
}

# --------------------------------------------------------- etapa 6: banco --
setup_database() {
  section "Etapa 6/8 — Preparando banco de dados (SQLite)"

  mkdir -p "$APP_ROOT/storage"

  log "Rodando 'bin/rails db:prepare' (1ª opção)"
  if run_logged "bin/rails db:prepare"; then
    ok "Banco de dados preparado"
    record_step "Banco de dados" "OK (db:prepare)"
    return 0
  fi

  warn "db:prepare falhou, tentando db:create + db:schema:load (2ª opção)"
  if run_logged "bin/rails db:create" && run_logged "bin/rails db:schema:load"; then
    ok "Banco criado e schema carregado"
    record_step "Banco de dados" "OK (create + schema:load)"
    return 0
  fi

  warn "Ainda falhou, tentando db:create + db:migrate (3ª opção)"
  if run_logged "bin/rails db:create" && run_logged "bin/rails db:migrate"; then
    ok "Banco criado e migrado"
    record_step "Banco de dados" "OK (create + migrate)"
    return 0
  fi

  error "Não foi possível preparar o banco de dados. Veja $LOGFILE."
  record_step "Banco de dados" "FALHOU (ver log)"
  return 1
}

# ------------------------------------------------------ etapa 7: limpeza --
clean_logs_tmp() {
  section "Etapa 7/8 — Limpando logs e tmp antigos"
  if run_logged "bin/rails log:clear tmp:clear"; then
    ok "log/ e tmp/ limpos"
    record_step "log:clear tmp:clear" "OK"
    return 0
  fi
  warn "Falhou via rails task, limpando manualmente (2ª opção)"
  if run_logged "rm -f log/*.log" && run_logged "rm -rf tmp/cache/* tmp/pids/* tmp/storage/*"; then
    ok "Limpeza manual concluída"
    record_step "log:clear tmp:clear" "OK (manual)"
    return 0
  fi
  warn "Não foi possível limpar logs/tmp — não é crítico, seguindo"
  record_step "log:clear tmp:clear" "FALHOU (não crítico)"
  return 1
}

# ------------------------------------------- etapa 8: modelos face-api.js --
download_face_models() {
  section "Etapa 8/8 — Modelos de reconhecimento facial (face-api.js)"

  if [ "$SKIP_MODELS" -eq 1 ]; then
    log "Pulado por --skip-models"
    record_step "Modelos face-api.js" "PULADO"
    return 0
  fi

  if [ -f "$APP_ROOT/public/js/face-api.min.js" ] && [ -d "$APP_ROOT/public/models" ] && [ -n "$(ls -A "$APP_ROOT/public/models" 2>/dev/null)" ]; then
    ok "Modelos já presentes em public/models"
    record_step "Modelos face-api.js" "OK (já presentes)"
    return 0
  fi

  if ! confirm "Baixar face-api.js + modelos de reconhecimento facial (~15MB via CDN)?"; then
    log "Usuário optou por pular o download dos modelos"
    record_step "Modelos face-api.js" "PULADO (usuário)"
    return 0
  fi

  log "Rodando bin/download_models (1ª opção, jsDelivr)"
  if run_logged "bin/download_models"; then
    ok "Modelos baixados com sucesso"
    record_step "Modelos face-api.js" "OK"
    return 0
  fi

  warn "Download via jsDelivr falhou, tentando novamente uma vez (2ª opção, rede instável)"
  sleep 2
  if run_logged "bin/download_models"; then
    ok "Modelos baixados na 2ª tentativa"
    record_step "Modelos face-api.js" "OK (2ª tentativa)"
    return 0
  fi

  error "Não foi possível baixar os modelos de reconhecimento facial. A câmera/vision.js não funcionará."
  error "Rode 'bin/download_models' manualmente mais tarde, ou baixe de https://github.com/justadudewhohacks/face-api.js"
  record_step "Modelos face-api.js" "FALHOU (recurso opcional)"
  return 1
}

# ---------------------------------------------------------------- resumo --
print_summary() {
  section "Resumo da instalação"
  local any_fail=0
  for i in "${!STEP_NAMES[@]}"; do
    local name="${STEP_NAMES[$i]}"
    local result="${STEP_RESULTS[$i]}"
    if [[ "$result" == FALHOU* ]]; then
      any_fail=1
      printf "  ${C_RED}✗${C_RESET} %-35s %s\n" "$name" "$result" | tee -a "$LOGFILE"
    elif [[ "$result" == PULADO* ]]; then
      printf "  ${C_YELLOW}—${C_RESET} %-35s %s\n" "$name" "$result" | tee -a "$LOGFILE"
    else
      printf "  ${C_GREEN}✓${C_RESET} %-35s %s\n" "$name" "$result" | tee -a "$LOGFILE"
    fi
  done

  echo "" | tee -a "$LOGFILE"
  log "Log completo salvo em: $LOGFILE"

  if [ "$any_fail" -eq 1 ]; then
    fail_msg "Uma ou mais etapas falharam. Revise o log acima antes de rodar o servidor."
    return 1
  fi
  ok "Tudo pronto! Rode 'bin/dev' para iniciar o servidor."
  return 0
}

# ====================================================================== main
main() {
  log "Iniciando setup completo do Amic Web — log em $LOGFILE"
  detect_os

  install_system_packages
  install_ruby
  install_bundler
  run_bundle_install
  check_credentials
  setup_database
  clean_logs_tmp
  download_face_models

  print_summary
  local summary_status=$?

  if [ "$START_SERVER" -eq 1 ] && [ "$summary_status" -eq 0 ]; then
    section "Subindo o servidor de desenvolvimento (bin/dev)"
    exec bin/dev
  elif [ "$START_SERVER" -eq 1 ]; then
    warn "Servidor não foi iniciado automaticamente por causa das falhas acima. Rode 'bin/dev' manualmente após corrigir."
  fi

  exit "$summary_status"
}

main
