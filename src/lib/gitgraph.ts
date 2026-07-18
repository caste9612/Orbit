// Layout "a corsie" del graph log (stile IntelliJ/VS): dato l'elenco commit (ordine topologico+tempo,
// dal backend git_graph, con i parent), assegna a ogni commit una lane e produce i segmenti da disegnare
// (metà-superiore e metà-inferiore di ogni riga) + il nodo. Puro e senza dipendenze — testabile a sé.

export interface GitRef {
  name: string;
  kind: "head" | "branch" | "remote" | "tag";
}
export interface GraphCommit {
  id: string;
  short: string;
  summary: string;
  author: string;
  time: number; // secondi epoch
  parents: string[]; // oid completi dei genitori
  refs: GitRef[];
}

export interface Segment {
  from: number; // lane di partenza
  to: number; // lane di arrivo
  color: string;
}
export interface GraphRow {
  commit: GraphCommit;
  col: number; // lane del nodo
  color: string; // colore della lane del nodo
  merge: boolean; // true se il commit ha ≥2 genitori
  top: Segment[]; // segmenti nella metà superiore della riga (riga sopra → centro)
  bottom: Segment[]; // segmenti nella metà inferiore (centro → riga sotto)
  width: number; // n° di lane occupate su questa riga (per dimensionare la cella)
}

// Palette lane: colori distinguibili, leggibili su tema chiaro e scuro.
export const LANE_COLORS = [
  "#4c8dff",
  "#3fb950",
  "#e3b341",
  "#a472ff",
  "#ff7b72",
  "#22c7b3",
  "#f78166",
  "#db61a2",
];

/** Calcola il layout del grafo. Restituisce una riga per commit + la larghezza massima (in lane). */
export function layoutGraph(commits: GraphCommit[]): { rows: GraphRow[]; maxWidth: number } {
  const lanes: (string | null)[] = []; // lanes[i] = oid che la lane i sta "aspettando" (prossimo commit)
  const laneColor: string[] = [];
  let colorSeq = 0;
  const rows: GraphRow[] = [];
  let maxWidth = 0;

  const firstFree = (): number => {
    const i = lanes.indexOf(null);
    return i >= 0 ? i : lanes.length;
  };
  const newColor = (): string => LANE_COLORS[colorSeq++ % LANE_COLORS.length];
  const lastUsed = (arr: (string | null)[]): number => {
    let m = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i] != null) m = i;
    return m;
  };

  for (const c of commits) {
    // snapshot dello stato SOPRA questa riga (prima di qualsiasi mutazione)
    const incoming = lanes.slice();
    const incomingColor = laneColor.slice();

    // 1. lane del nodo: la prima lane che aspetta questo commit; altrimenti una nuova.
    let col = lanes.indexOf(c.id);
    if (col === -1) {
      col = firstFree();
      lanes[col] = c.id;
      laneColor[col] = newColor();
    }
    const nodeColor = laneColor[col];

    // 2. altre lane che convergono su questo commit (si fondono nel nodo)
    const merged: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (i !== col && lanes[i] === c.id) merged.push(i);
    }

    // 3. la lane del nodo prosegue verso il PRIMO genitore; senza genitori (radice) la lane finisce.
    const childLanes: number[] = [];
    if (c.parents.length > 0) {
      lanes[col] = c.parents[0];
      childLanes.push(col);
    } else {
      lanes[col] = null;
    }
    for (const m of merged) lanes[m] = null; // le lane fuse terminano qui

    // 4. genitori aggiuntivi (merge): ognuno apre/riusa una lane verso quel genitore
    for (let p = 1; p < c.parents.length; p++) {
      const pid = c.parents[p];
      let lane = lanes.indexOf(pid); // riusa se una lane già lo aspetta
      if (lane === -1) {
        lane = firstFree();
        lanes[lane] = pid;
        laneColor[lane] = newColor();
      }
      childLanes.push(lane);
    }

    // snapshot dello stato SOTTO questa riga
    const outgoing = lanes.slice();

    // 5. segmenti metà-superiore: da ogni lane in ingresso verso il nodo (se aspettava c) o dritto giù
    const top: Segment[] = [];
    for (let i = 0; i < incoming.length; i++) {
      if (incoming[i] == null) continue;
      if (incoming[i] === c.id) top.push({ from: i, to: col, color: incomingColor[i] });
      else top.push({ from: i, to: i, color: incomingColor[i] });
    }

    // 6. segmenti metà-inferiore: dal nodo verso le lane dei genitori, e pass-through dritti
    const bottom: Segment[] = [];
    for (let j = 0; j < outgoing.length; j++) {
      if (outgoing[j] == null) continue;
      if (childLanes.includes(j)) bottom.push({ from: col, to: j, color: laneColor[j] });
      else bottom.push({ from: j, to: j, color: laneColor[j] });
    }

    const width = Math.max(lastUsed(incoming), lastUsed(outgoing), col) + 1;
    maxWidth = Math.max(maxWidth, width);
    rows.push({ commit: c, col, color: nodeColor, merge: c.parents.length > 1, top, bottom, width });
  }

  return { rows, maxWidth };
}
