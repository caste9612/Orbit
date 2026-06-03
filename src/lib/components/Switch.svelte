<script lang="ts">
  // Interruttore on/off riusabile (usato nelle Impostazioni).
  interface Props {
    checked: boolean;
    onToggle: () => void;
    label?: string;
  }
  let { checked, onToggle, label = "" }: Props = $props();
</script>

<button
  class="switch"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={onToggle}
>
  <span class="knob"></span>
</button>

<style>
  .switch {
    flex: 0 0 auto;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    border: 0;
    background: var(--color-surface-4);
    cursor: pointer;
    padding: 0;
    position: relative;
    transition: background 120ms ease;
  }
  .switch.on {
    background: var(--color-accent);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 120ms ease;
  }
  .switch.on .knob {
    transform: translateX(18px);
  }
</style>
