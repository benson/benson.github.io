export const APEX_CONTRACT_SCHEMA = "lastlight.apex.v1";
export const APEX_STATE_SCHEMA = "lastlight.apex-state.v1";
export const APEX_MAP_IDS = Object.freeze(["warehouse", "outskirts", "lab", "beachhead"]);

const intent = (id, telegraphTicks, activeTicks, recoveryTicks, shape, targetPolicy, damage, options = {}) => Object.freeze({
  id, telegraphTicks, activeTicks, recoveryTicks, shape, targetPolicy, damage,
  interruptPolicy: options.interruptPolicy || "unstoppable",
  geometry: Object.freeze({ ...options.geometry }), text: options.text || id.replaceAll("-", " "),
  pattern: options.pattern || shape, sound: options.sound || "enemy:apex",
});
const phase = (id, enterHpRatio, arenaMode, intentCycle) => Object.freeze({ id, enterHpRatio, arenaMode, intentCycle: Object.freeze(intentCycle) });

const registry = {
  warehouse: { bossName: "TUNNELMAW", phases: [phase("breach", 1, "sealed-floor", ["lock-ram", "relay-burst"]), phase("cave-in", .55, "ruptured-floor", ["lock-ram", "collapse-ring", "relay-burst"])], intents: {
    "lock-ram": intent("lock-ram",72,30,42,"line","nearest",3.5,{interruptPolicy:"stagger",geometry:{range:620,halfWidth:66},text:"LOCKED RAM",pattern:"chevrons"}),
    "relay-burst": intent("relay-burst",90,1,42,"annulus","center",3.8,{geometry:{innerRadius:150,outerRadius:410},text:"RELAY OVERLOAD",pattern:"double-ring"}),
    "collapse-ring": intent("collapse-ring",78,1,48,"annulus","self",4,{geometry:{innerRadius:185,outerRadius:520},text:"FLOOR COLLAPSE",pattern:"broken-ring"}),
  }},
  outskirts: { bossName: "RED HUNGER", phases: [phase("hunt",1,"open-ash",["marked-pounce","claw-cone"]),phase("redline",.55,"ion-grid",["marked-pounce","ion-lanes","claw-cone"])], intents: {
    "marked-pounce":intent("marked-pounce",60,24,42,"line","nearest",3.6,{interruptPolicy:"stagger",geometry:{range:680,halfWidth:58},text:"MARKED POUNCE",pattern:"claw-line"}),
    "claw-cone":intent("claw-cone",54,1,36,"cone","nearest",3.4,{geometry:{range:360,halfAngle:.52},text:"RAZOR FAN",pattern:"triple-claw"}),
    "ion-lanes":intent("ion-lanes",90,18,48,"lanes","arena",4,{geometry:{axis:"x",width:118,spacing:310},text:"ION GRID",pattern:"striped-lanes"}),
  }},
  lab: { bossName: "VOID EMPRESS", phases:[phase("containment",1,"cold-floor",["shard-annulus","core-beam"]),phase("fracture",.55,"freeze-cores",["double-core-beam","shard-annulus","prism-burst"])],intents:{
    "shard-annulus":intent("shard-annulus",72,1,42,"annulus","self",3.5,{geometry:{innerRadius:150,outerRadius:470},text:"SHARD RING",pattern:"ice-ring"}),
    "core-beam":intent("core-beam",72,24,42,"line","cardinal",3.7,{geometry:{range:900,halfWidth:54},text:"CORE BEAM",pattern:"snowflake-line"}),
    "double-core-beam":intent("double-core-beam",78,24,48,"lanes","cardinal",3.8,{geometry:{axis:"cycle",width:94,spacing:280},text:"TWIN CORE BEAMS",pattern:"double-line"}),
    "prism-burst":intent("prism-burst",84,18,48,"radial","self",4,{geometry:{count:12,range:920,halfWidth:22},text:"PRISM BURST",pattern:"twelve-ray"}),
  }},
  beachhead:{bossName:"ABYSS BLADE",phases:[phase("low-tide",1,"dry-shore",["tidal-cleave","undertow-dash"]),phase("high-tide",.55,"rising-ocean",["tidal-cleave","undertow-dash","breaker-wave"])],intents:{
    "tidal-cleave":intent("tidal-cleave",60,1,36,"cone","nearest",3.5,{geometry:{range:390,halfAngle:.58},text:"TIDAL CLEAVE",pattern:"wave-cone"}),
    "undertow-dash":intent("undertow-dash",72,30,42,"line","nearest",3.7,{interruptPolicy:"stagger",geometry:{range:700,halfWidth:62},text:"UNDERTOW DASH",pattern:"current-line"}),
    "breaker-wave":intent("breaker-wave",90,18,48,"lanes","arena",4,{geometry:{axis:"y",width:125,spacing:330},text:"BREAKER WAVE",pattern:"wave-lanes"}),
  }},
};

export const APEX_CONTRACTS = Object.freeze(Object.fromEntries(Object.entries(registry).map(([mapId,value])=>[mapId,Object.freeze({schema:APEX_CONTRACT_SCHEMA,id:`${mapId}-apex-v1`,mapId,bossName:value.bossName,phaseGateRatio:.55,transitionTicks:90,enrageTicks:18_000,lethalTicks:19_800,phases:Object.freeze(value.phases),intents:Object.freeze(value.intents)})])));

export function validateApexContracts(contracts=APEX_CONTRACTS){
  const errors=[],ids=Object.keys(contracts||{}).sort();
  if(JSON.stringify(ids)!==JSON.stringify([...APEX_MAP_IDS].sort()))errors.push("registry must contain exactly the four authored maps");
  for(const mapId of APEX_MAP_IDS){const contract=contracts?.[mapId];if(!contract)continue;
    if(contract.schema!==APEX_CONTRACT_SCHEMA||contract.mapId!==mapId||typeof contract.id!=="string")errors.push(`${mapId}: invalid identity`);
    if(!Array.isArray(contract.phases)||contract.phases.length<2||contract.phases[0]?.enterHpRatio!==1)errors.push(`${mapId}: requires at least two ordered phases`);
    let previous=Infinity;for(const [index,entry] of (contract.phases||[]).entries()){if(!entry||entry.enterHpRatio<=0||entry.enterHpRatio>1||entry.enterHpRatio>=previous)errors.push(`${mapId}.phases.${index}: ratios must strictly descend`);previous=entry?.enterHpRatio;for(const intentId of entry?.intentCycle||[])if(!contract.intents?.[intentId])errors.push(`${mapId}.${entry.id}: unknown intent ${intentId}`);}
    for(const [intentId,entry] of Object.entries(contract.intents||{})){if(entry.id!==intentId||!["line","cone","annulus","lanes","radial"].includes(entry.shape))errors.push(`${mapId}.${intentId}: invalid shape identity`);for(const key of ["telegraphTicks","activeTicks","recoveryTicks"])if(!Number.isSafeInteger(entry[key])||entry[key]<1||entry[key]>600)errors.push(`${mapId}.${intentId}.${key}: invalid tick duration`);if(!Number.isFinite(entry.damage)||entry.damage<=0||entry.damage>10)errors.push(`${mapId}.${intentId}: invalid damage`);if(!entry.text||!entry.pattern||!entry.sound)errors.push(`${mapId}.${intentId}: incomplete accessible presentation`);}
  }return errors;
}
const contractErrors=validateApexContracts();if(contractErrors.length)throw new TypeError(`Invalid apex contract: ${contractErrors.join("; ")}`);
export function apexPhaseForRatio(contract,hpRatio){const ratio=Math.max(0,Math.min(1,Number(hpRatio)||0));let index=0;for(let candidate=1;candidate<contract.phases.length;candidate++)if(ratio<=contract.phases[candidate].enterHpRatio)index=candidate;return Object.freeze({index,phase:contract.phases[index]});}
export function orderedApexTargets(origin,players,count=1){return [...players].filter(p=>!p.dead&&!p.downed).sort((l,r)=>{const ld=(l.x-origin.x)**2+(l.y-origin.y)**2,rd=(r.x-origin.x)**2+(r.y-origin.y)**2;return ld-rd||(Number(l.replaySlot??99)-Number(r.replaySlot??99))||(String(l.id)<String(r.id)?-1:String(l.id)>String(r.id)?1:0);}).slice(0,Math.max(1,Math.min(4,count)));}
export function apexPhaseDividers(contract){return contract.phases.slice(1).map(entry=>Object.freeze({position:entry.enterHpRatio,phaseId:entry.id,major:true}));}
