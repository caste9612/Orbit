<script lang="ts">
  // Area centrale: barra delle tab + editor. In milestone 2 mostra lo stato di benvenuto.
  // CodeMirror arriva in milestone 4.
</script>

<section class="editor-area">
  <div class="tabbar">
    <!-- le tab dei file aperti compariranno qui (milestone 4) -->
  </div>

  <div class="surface">
    <div class="welcome">
      <div class="mark">Lume</div>
      <div class="tagline">IDE leggero · companion per Claude Code</div>

      <ul class="hints">
        <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Apri cartella</span></li>
        <li><kbd>Ctrl</kbd><kbd>P</kbd><span>Vai al file</span></li>
        <li><kbd>Ctrl</kbd><kbd>`</kbd><span>Terminale integrato</span></li>
      </ul>
    </div>
  </div>
</section>

<style>
  .editor-area {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
  }
  .tabbar {
    height: 36px;
    flex: 0 0 36px;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
    display: flex;
    align-items: stretch;
  }
  .surface {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: auto;
  }
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    user-select: none;
    transform: translateY(-6%);
  }
  .mark {
    font-size: 56px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    background: linear-gradient(180deg, var(--color-ink) 0%, var(--color-ink-subtle) 130%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .tagline {
    color: var(--color-ink-muted);
    font-size: 13px;
    margin-bottom: 22px;
  }
  .hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .hints li {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 6px;
  }
  .hints span {
    color: var(--color-ink-muted);
    font-size: 12.5px;
    margin-left: 10px;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink-muted);
    background: var(--color-surface-3);
    border: 1px solid var(--color-line-strong);
    border-bottom-width: 2px;
    border-radius: 5px;
    padding: 2px 7px;
    min-width: 16px;
    text-align: center;
  }
</style>
