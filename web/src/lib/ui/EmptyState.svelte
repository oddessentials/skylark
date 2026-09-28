<script lang="ts">
  let { message }: { message: string } = $props();
</script>

<p class="note flex items-baseline gap-3 px-2 py-4">
  <span
    class="inline-block h-px w-5 shrink-0 translate-y-[-0.3em] bg-accent-deep"
    aria-hidden="true"
  ></span>
  {message}
</p>
