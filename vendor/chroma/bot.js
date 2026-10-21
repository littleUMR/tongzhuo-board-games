const { act, current, scores, neighbors, has, canSkill } = require('./game');

function chooseAugment(game,id){
  const priority=['basics','endless_ink','plated','ink_reserve','well_master','sword','empire','siphon','spellcraft','scholar','long_leap','fortress'];
  const rank=key=>{const i=priority.indexOf(key);return i<0?priority.length:i;};
  return [...game.draft.offers[id]].sort((a,b)=>rank(a)-rank(b))[0];
}

// Evaluate only public board information and this bot's own hand.
// Every candidate passes through the same rule engine as a human action.
function chooseAction(game, id) {
  if (game.finished || game.draft || current(game) !== id) return null;
  const before = scores(game);
  const wells = game.board.flatMap((cell, i) =>
    cell.terrain === 'well' && cell.owner !== id ? [i] : []);
  const distance = (a, b) => Math.abs(a % game.size - b % game.size)
    + Math.abs(Math.floor(a / game.size) - Math.floor(b / game.size));
  const modes = ['paint', 'shield', ...new Set(game.hands[id].filter(mode=>canSkill(game,id,mode)))];
  let best = null, bestValue = -Infinity;
  for (const mode of modes) {
    for (let index = 0; index < game.board.length; index++) {
      const cell = game.board[index];
      if (cell.terrain === 'rock') continue;
      if (mode === 'shield' ? cell.owner !== id || cell.shield : cell.owner === id || cell.home) continue;
      const trial = structuredClone(game);
      const action={mode,index};
      if(mode==='paint'&&has(game,id,'basics')){
        const candidates=neighbors(index,game.size).filter(i=>{const c=game.board[i];return c.owner!==id&&!c.home&&c.terrain!=='rock';});
        candidates.sort((a,b)=>(game.board[b].terrain==='well'?4:1)-(game.board[a].terrain==='well'?4:1));
        if(candidates.length)action.second=candidates[0];
      }
      try { act(trial, id, action); } catch { continue; }
      const after = scores(trial), spent = game.ink - trial.ink;
      let value = (after[id] - before[id]) / Math.max(1,spent);
      value += Object.keys(before).reduce((sum, other) =>
        sum + (other === id ? 0 : before[other] - after[other]), 0) * 0.65;
      if (mode === 'shield') {
        const threatened = neighbors(index, game.size)
          .some(i => game.board[i].owner && game.board[i].owner !== id);
        value = threatened ? (cell.terrain === 'well' ? 2.6 : 0.65) : 0.02;
      } else if (wells.length) {
        value += 0.6 / (1 + Math.min(...wells.map(w => distance(index, w))));
      }
      value += Math.random() * 0.18;
      if (value > bestValue) { bestValue = value; best = action; }
    }
  }
  return best || { mode: 'end' };
}

module.exports = { chooseAction,chooseAugment };
