<script lang="ts">
  // Impostazioni → Shelf (M73): le regole che valgono in ogni repo (su questo PC) e le categorie, con colore
  // ed esclusione da ricerca e Quick Open. Ci si arriva anche dalla ⚙ nella testata dello scaffale.
  import Icon from "./Icon.svelte";
  import Switch from "./Switch.svelte";
  import { TAB_COLORS } from "../state/terminals.svelte";
  import {
    shelfGlobal,
    allCategories,
    categoryMeta,
    shelveRule,
    unshelveRule,
    unshelveRuleCategory,
    setCategoryColor,
    setCategoryHiddenFromSearch,
    deleteCategory,
  } from "../state/shelf.svelte";
  import type { RuleKind } from "../state/shelfRules";

  let rules = $derived(
    (["folders", "files"] as const)
      .flatMap((kind) => Object.entries(shelfGlobal[kind]).map(([pattern, cats]) => ({ kind, pattern, cats })))
      .sort((a, b) => a.pattern.localeCompare(b.pattern, undefined, { sensitivity: "base" })),
  );
  let cats = $derived(allCategories());

  let pattern = $state("");
  let kind = $state<RuleKind>("folders");
  let category = $state("");
  let canAdd = $derived(!!pattern.trim() && !!category.trim());
  function add() {
    if (!canAdd) return;
    shelveRule(kind, pattern, category, true);
    pattern = "";
  }
</script>

<section class="block">
  <h3 class="btitle">Rules for every repository</h3>
  <p class="bhint">
    Folders or files matching these names go on the shelf in every repository you open on this PC. Use <code>*</code> and
    <code>?</code> for patterns: <code>.*</code> takes every folder starting with a dot, <code>*.DotSettings.user</code> those files.
  </p>
  {#if rules.length}
    <div class="rules">
      {#each rules as r (r.kind + r.pattern)}
        <div class="rule">
          <span class="ric" title={r.kind === "folders" ? "Folders" : "Files"}><Icon name={r.kind === "folders" ? "folder" : "file"} size={14} strokeWidth={1.6} /></span>
          <code class="pat">{r.pattern}</code>
          <span class="cats">
            {#each r.cats as c (c)}
              {@const color = categoryMeta(c).color}
              <span class="chip">
                {#if color}<span class="dot" style="background:{color}"></span>{/if}{c}
                {#if r.cats.length > 1}
                  <button class="chip-x" title="Remove from {c}" aria-label="Remove from {c}" onclick={() => unshelveRuleCategory(r.kind, r.pattern, c, true)}>
                    <Icon name="x" size={10} strokeWidth={2.2} />
                  </button>
                {/if}
              </span>
            {/each}
          </span>
          <button class="del" title="Remove the rule" aria-label="Remove the rule" onclick={() => unshelveRule(r.kind, r.pattern, true)}>
            <Icon name="trash" size={13} strokeWidth={1.8} />
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">No rules yet. Add one here, or tick <b>In every repository</b> when you shelve a folder.</div>
  {/if}
  <div class="addrow">
    <select class="control kind" bind:value={kind} aria-label="Folders or files">
      <option value="folders">Folders</option>
      <option value="files">Files</option>
    </select>
    <input
      class="control grow mono"
      bind:value={pattern}
      placeholder="name or pattern, e.g. .*"
      spellcheck="false"
      onkeydown={(e) => e.key === "Enter" && add()}
      aria-label="Name or pattern"
    />
    <input class="control cat" bind:value={category} placeholder="category" list="shelf-cats" onkeydown={(e) => e.key === "Enter" && add()} aria-label="Category" />
    <datalist id="shelf-cats">
      {#each cats as c (c)}<option value={c}></option>{/each}
    </datalist>
    <button class="control" disabled={!canAdd} onclick={add}>Add</button>
  </div>
</section>

<section class="block">
  <h3 class="btitle">Categories</h3>
  <p class="bhint">The categories of this repository and of the rules above. Colors and the search option apply everywhere.</p>
  {#if cats.length}
    {#each cats as c (c)}
      {@const meta = categoryMeta(c)}
      <div class="catrow">
        <span class="cname">
          <span class="dot big" style={meta.color ? `background:${meta.color}` : ""} class:none={!meta.color}></span>{c}
        </span>
        <span class="swatches">
          {#each TAB_COLORS as t (t.color)}
            <button
              class="swatch"
              class:on={meta.color === t.color}
              style="--sw:{t.color}"
              title={t.name}
              aria-label={t.name}
              onclick={() => setCategoryColor(c, meta.color === t.color ? null : t.color)}
            ></button>
          {/each}
        </span>
        <span class="srch" title="Keep its items out of search and Quick Open">
          <Icon name="search-off" size={13} strokeWidth={1.8} />
          <Switch checked={!!meta.hideFromSearch} onToggle={() => setCategoryHiddenFromSearch(c, !meta.hideFromSearch)} label="Hide {c} from search and Quick Open" />
        </span>
        <button class="del" title="Delete the category: its items go back to the tree" aria-label="Delete {c}" onclick={() => deleteCategory(c)}>
          <Icon name="trash" size={13} strokeWidth={1.8} />
        </button>
      </div>
    {/each}
  {:else}
    <div class="empty">No categories yet.</div>
  {/if}
</section>

<style>
  .block {
    margin-top: 18px;
  }
  .btitle {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .bhint {
    margin: 0 0 10px;
    color: var(--color-ink-subtle);
    font-size: 12px;
    line-height: 1.5;
  }
  code {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-ink-muted);
  }
  .rules {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-line);
    border-radius: var(--r-md);
    overflow: hidden;
  }
  .rule,
  .catrow {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 3px 8px;
  }
  .rule + .rule {
    border-top: 1px solid var(--color-line);
  }
  .rule:hover,
  .catrow:hover {
    background: var(--color-surface-2);
  }
  .ric {
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .pat {
    flex: 0 0 auto;
    min-width: 90px;
    color: var(--color-ink);
    font-size: 12.5px;
  }
  .cats {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--color-surface-3);
    color: var(--color-ink-muted);
    font-size: 11.5px;
  }
  .chip-x {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .chip-x:hover {
    color: var(--color-ink);
  }
  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .dot.big {
    width: 9px;
    height: 9px;
    margin-right: 7px;
  }
  .dot.none {
    border: 1px solid var(--color-line-strong);
  }
  .del {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 26px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .del:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
  .empty {
    padding: 8px 2px;
    color: var(--color-ink-subtle);
    font-size: 12px;
  }
  .empty b {
    font-weight: 600;
    color: var(--color-ink-muted);
  }
  .addrow {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .control {
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    outline: none;
  }
  .control:focus {
    border-color: var(--color-accent);
  }
  button.control {
    cursor: pointer;
  }
  button.control:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .cat {
    width: 130px;
  }
  .catrow {
    border-radius: var(--r-md);
  }
  .cname {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink);
    font-size: 12.5px;
  }
  .swatches {
    display: flex;
    gap: 4px;
  }
  .swatch {
    width: 14px;
    height: 14px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--sw);
    cursor: pointer;
  }
  .swatch.on {
    border-color: var(--color-ink);
  }
  .srch {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 6px;
    color: var(--color-ink-subtle);
  }
</style>
