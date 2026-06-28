import { loadSnapshot } from '../mutate.mjs';
import { collectionOf, containersOf, summarize } from '../snapshot.mjs';

export default {
  summary: 'collection totals and top-value cards',
  help: 'usage: bp summary [--json]\n\nshows unique stacks, total cards, estimated value, container count, and your most valuable cards.',
  async run(ctx) {
    const { out } = ctx;
    const session = ctx.makeSession();
    const { snapshot } = await loadSnapshot(session);
    const collection = collectionOf(snapshot);
    const stats = summarize(collection);
    const containers = Object.values(containersOf(snapshot));
    const top = collection
      .filter(c => typeof c.price === 'number')
      .map(c => ({ name: c.resolvedName || c.name, set: (c.setCode || '').toUpperCase(), qty: c.qty, price: c.price, value: Math.round(c.price * (c.qty || 1) * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    out.emit({ ...stats, containers: containers.length, topValue: top }, () => {
      out.line(out.c.bold('collection summary'));
      out.line(`  unique stacks : ${stats.unique}`);
      out.line(`  total cards   : ${stats.total}`);
      out.line(`  est. value    : $${stats.value.toFixed(2)}`);
      out.line(`  containers    : ${containers.length}`);
      if (top.length) {
        out.line('');
        out.line(out.c.bold('top value'));
        for (const c of top) out.line(`  $${c.value.toFixed(2).padStart(8)}  ${c.name} (${c.set})${c.qty > 1 ? ' x' + c.qty : ''}`);
      }
    });
    return 0;
  },
};
