"""Read-only audit of 42 SRD66-68 gear headings and selected mechanical parameters.

Not a full semantic audit of translations, combat interactions or runtime acceptance.
"""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-srd-transport.py'))
SHA256=shared['SHA256']
HEADINGS=['Acid','Alchemist’s Fire','Antitoxin','Arcane Focus','Ball Bearings','Block and Tackle','Book','Caltrops','Candle','Case, Crossbow Bolt','Case, Map or Scroll','Chain','Climber’s Kit','Component Pouch','Crowbar','Druidic Focus','Fishing Tackle','Healer’s Kit','Holy Symbol','Holy Water','Hunting Trap','Lamp','Lantern, Bullseye','Lantern, Hooded','Lock','Magnifying Glass','Manacles','Mess Kit','Oil','Poison, Basic','Potion of Healing','Pouch','Quiver','Ram, Portable','Rations','Rope','Scale, Merchant’s','Spellbook','Spyglass','Tent','Tinderbox','Torch']

# Explicit mapping reviewed against the source and existing equipment identities.
# This is not derived from the candidate manifest when the audit runs.
EXPECTED_ITEM_IDS={
  "Acid": [
    "srd51:2014:item:acid-vial"
  ],
  "Alchemist’s Fire": [
    "srd51:2014:item:alchemists-fire-flask"
  ],
  "Antitoxin": [
    "srd51:2014:item:antitoxin-vial"
  ],
  "Arcane Focus": [
    "srd51:2014:item:arcane-focus-crystal",
    "srd51:2014:item:arcane-focus-orb",
    "srd51:2014:item:arcane-focus-rod",
    "srd51:2014:item:arcane-focus-staff",
    "srd51:2014:item:arcane-focus-wand"
  ],
  "Ball Bearings": [
    "srd51:2014:item:ball-bearings-bag-1000"
  ],
  "Block and Tackle": [
    "srd51:2014:item:block-and-tackle"
  ],
  "Book": [
    "srd51:2014:item:book"
  ],
  "Caltrops": [
    "srd51:2014:item:caltrops-bag-20"
  ],
  "Candle": [
    "srd51:2014:item:candle"
  ],
  "Case, Crossbow Bolt": [
    "srd51:2014:item:crossbow-bolt-case"
  ],
  "Case, Map or Scroll": [
    "srd51:2014:item:map-or-scroll-case"
  ],
  "Chain": [
    "srd51:2014:item:chain-10-feet"
  ],
  "Climber’s Kit": [
    "srd51:2014:item:climbers-kit"
  ],
  "Component Pouch": [
    "srd51:2014:item:component-pouch"
  ],
  "Crowbar": [
    "srd51:2014:item:crowbar"
  ],
  "Druidic Focus": [
    "srd51:2014:item:druidic-focus-mistletoe",
    "srd51:2014:item:druidic-focus-totem",
    "srd51:2014:item:druidic-focus-wooden-staff",
    "srd51:2014:item:druidic-focus-yew-wand"
  ],
  "Fishing Tackle": [
    "srd51:2014:item:fishing-tackle"
  ],
  "Healer’s Kit": [
    "srd51:2014:item:healers-kit"
  ],
  "Holy Symbol": [
    "srd51:2014:item:holy-symbol-amulet",
    "srd51:2014:item:holy-symbol-emblem",
    "srd51:2014:item:holy-symbol-reliquary"
  ],
  "Holy Water": [
    "srd51:2014:item:holy-water-flask"
  ],
  "Hunting Trap": [
    "srd51:2014:item:hunting-trap"
  ],
  "Lamp": [
    "srd51:2014:item:lamp"
  ],
  "Lantern, Bullseye": [
    "srd51:2014:item:bullseye-lantern"
  ],
  "Lantern, Hooded": [
    "srd51:2014:item:hooded-lantern"
  ],
  "Lock": [
    "srd51:2014:item:lock"
  ],
  "Magnifying Glass": [
    "srd51:2014:item:magnifying-glass"
  ],
  "Manacles": [
    "srd51:2014:item:manacles"
  ],
  "Mess Kit": [
    "srd51:2014:item:mess-kit"
  ],
  "Oil": [
    "srd51:2014:item:oil-flask"
  ],
  "Poison, Basic": [
    "srd51:2014:item:basic-poison-vial"
  ],
  "Potion of Healing": [
    "srd51:2014:item:potion-of-healing"
  ],
  "Pouch": [
    "srd51:2014:item:pouch"
  ],
  "Quiver": [
    "srd51:2014:item:quiver"
  ],
  "Ram, Portable": [
    "srd51:2014:item:portable-ram"
  ],
  "Rations": [
    "srd51:2014:item:rations-one-day"
  ],
  "Rope": [
    "srd51:2014:item:hempen-rope-50-feet",
    "srd51:2014:item:silk-rope-50-feet"
  ],
  "Scale, Merchant’s": [
    "srd51:2014:item:merchants-scale"
  ],
  "Spellbook": [
    "srd51:2014:item:spellbook"
  ],
  "Spyglass": [
    "srd51:2014:item:spyglass"
  ],
  "Tent": [
    "srd51:2014:item:tent-two-person"
  ],
  "Tinderbox": [
    "srd51:2014:item:tinderbox"
  ],
  "Torch": [
    "srd51:2014:item:torch"
  ]
}

def normalize(text):
    text=shared['normalize'](text).replace('\u00ad','').replace('‐','-').replace('‑','-').replace("'",'’')
    return re.sub(r'\s*-+\s*','-',text).replace('brig ht','bright')

def extract_descriptions(text):
    text=normalize(text)
    first='Adventuring Gear This section describes items that have special rules or require further explanation.'
    if text.count(first)!=1:
        raise ValueError('Missing or ambiguous Adventuring Gear opening')
    text=text.split(first)[1]
    end='Adventuring Gear'
    if text.count(end)!=1:
        raise ValueError('Missing or ambiguous ending table heading')
    text=text.split(end)[0]
    heading_pattern='('+'|'.join(re.escape(name) for name in sorted(HEADINGS,key=len,reverse=True))+r')\. '
    hits=list(re.finditer(heading_pattern,text))
    positions=[]
    for name in HEADINGS:
        matches=[match for match in hits if match[1]==name]
        if len(matches)!=1:
            raise ValueError('Missing or ambiguous description: '+name)
        positions.append((matches[0].start(),matches[0].end(),name))
    if positions!=sorted(positions):
        raise ValueError('Unexpected description order')
    return {name:text[end:positions[i+1][0] if i+1<len(positions) else len(text)].strip() for i,(_,end,name) in enumerate(positions)}

# Each expression is evaluated inside its own bounded source paragraph.
# Values come from the PDF, never from adjacent descriptions or the proposed manifest.
SPECS=[
 ('Acid','damage.dice',r'takes (\d+d\d+) acid damage','str'),
 ('Alchemist’s Fire','damage.dice',r'takes (\d+d\d+) fire damage at the start of each of its turns','str'),
 ('Alchemist’s Fire','endEffect.dc',r'DC (\d+) Dexterity check to extinguish','int'),
 ('Antitoxin','duration.value',r'against poison for (\d+) hour','int'),
 ('Ball Bearings','save.dc',r'DC (\d+) Dexterity saving throw','int'),
 ('Ball Bearings','area.sideFeet',r'is (\d+) feet on a s\s*ide','int'),
 ('Block and Tackle','hoistLimitMultiplier',r'hoist up to (four) times','word'),
 ('Caltrops','area.sideFeet',r'is (\d+) feet on a side','int'),
 ('Caltrops','save.dc',r'DC (\d+) Dexterity saving throw','int'),
 ('Caltrops','onFailure.damage.amount',r'take (\d+) piercing damage','int'),
 ('Caltrops','onDamage.walkingSpeedReductionFeet',r'walking speed by (\d+) feet','int'),
 ('Candle','duration.value',r'For (\d+) hour','int'),
 ('Candle','light.brightFeet',r'bright light in a (\d+)-foot radius','int'),
 ('Candle','light.additionalDimFeet',r'additional (\d+) feet','int'),
 ('Case, Crossbow Bolt','capacity.maximum',r'up to (twenty) crossbow bolts','word'),
 ('Chain','hitPoints',r'has (\d+) hit points','int'),
 ('Chain','break.dc',r'DC (\d+) Strength check','int'),
 ('Climber’s Kit','maximumFallFromAnchorFeet',r'fall more than (\d+) feet','int'),
 ('Climber’s Kit','maximumClimbFromAnchorFeet',r'climb more than (\d+) feet','int'),
 ('Healer’s Kit','uses',r'has (ten) uses','word'),
 ('Healer’s Kit','targetHitPoints',r'has (\d+) hit points','int'),
 ('Holy Water','damage.dice',r'takes (\d+d\d+) radiant damage','str'),
 ('Holy Water','creation.duration.value',r'takes (\d+) hour','int'),
 ('Holy Water','creation.component.costGp',r'uses (\d+) gp worth','int'),
 ('Holy Water','creation.spellSlotLevel',r'expend a (\d+)st-level spell slot','int'),
 ('Hunting Trap','save.dc',r'DC (\d+) Dexterity saving throw','int'),
 ('Hunting Trap','onFailure.damage.dice',r'take (\d+d\d+) piercing damage','str'),
 ('Hunting Trap','movementLimit.typicalFeet',r'typically (\d+) feet long','int'),
 ('Hunting Trap','escape.dc',r'DC (\d+) Strength check','int'),
 ('Hunting Trap','escape.failedCheckDamage.amount',r'failed check deals (\d+) piercing','int'),
 ('Lock','pick.dc',r'DC (\d+) De\s*xterity check','int'),
 ('Magnifying Glass','fireStarting.duration.value',r'about (\d+) minutes','int'),
 ('Manacles','escape.dc',r'Escaping.*?DC (\d+) Dexterity check','int'),
 ('Manacles','break.dc',r'Breaking.*?DC (\d+) Strength check','int'),
 ('Manacles','pick.dc',r'lock with a successful DC (\d+) Dexterity check','int'),
 ('Manacles','hitPoints',r'have (\d+) hit points','int'),
 ('Oil','coatedTarget.dryAfter.value',r'dries \(after (\d+) minute\)','int'),
 ('Oil','coatedTarget.extraDamage.amount',r'additional (\d+) fire damage','int'),
 ('Oil','ground.area.sideFeet',r'a (\d+)-foot-square area','int'),
 ('Oil','ground.duration.value',r'burns for (\d+) rounds','int'),
 ('Oil','ground.damage.amount',r'and deals (\d+) fire damage','int'),
 ('Poison, Basic','save.dc',r'DC (\d+) Constitution saving throw','int'),
 ('Poison, Basic','onFailure.damage.dice',r'take (\d+d\d+) poison damage','str'),
 ('Poison, Basic','duration.value',r'for (\d+) minute before drying','int'),
 ('Potion of Healing','healing.dice',r'regains (\d+d\d+) \+ \d+ hit points','str'),
 ('Potion of Healing','healing.bonus',r'regains \d+d\d+ \+ (\d+) hit points','int'),
 ('Quiver','capacity.maximum',r'up to (\d+) arrows','int'),
 ('Ram, Portable','check.bonus',r'a \+(\d+) bonus on the Strength check','int'),
 ('Rope','hitPoints',r'has (\d+) hit points','int'),
 ('Rope','break.dc',r'DC (\d+) Strength check','int'),
 ('Scale, Merchant’s','includedWeightsUpToPounds',r'weights up to (\d+) pounds','int'),
 ('Spellbook','blankVellumPages',r'with (\d+) blank vellum pages','int'),
 ('Spyglass','apparentSizeMultiplier',r'to (twice) their size','word'),
 ('Tent','sleepingCapacity',r'sleeps (two)','word'),
 ('Tinderbox','lighting.1.duration.value',r'any other fire tak\s*es (\d+) minute','int'),
 ('Torch','duration.value',r'burns for (\d+) hour','int'),
 ('Torch','light.brightFeet',r'bright light in a (\d+)-foot radius','int'),
 ('Torch','light.additionalDimFeet',r'additional (\d+) feet','int'),
 ('Torch','attack.damage.amount',r'deals (\d+) fire damage','int'),
]
for name,shape in [('Lamp','radius'),('Lantern, Bullseye','cone'),('Lantern, Hooded','radius')]:
    SPECS.extend([(name,'light.brightFeet',r'bright light in a (\d+)-foot '+shape,'int'),(name,'light.additionalDimFeet',r'additional (\d+) feet','int'),(name,'duration.value',r'burns for (\d+) hours','int'),(name,'fuel.pints',r'flask \((\d+) pint\)','int')])
SPECS.append(('Lantern, Hooded','lowerHood.dimRadiusFeet',r'dim light in a (\d+)-\s*foot radius','int'))

# Essential qualifiers complement numeric checks. Russian wording still needs human review.
QUALIFIERS={
 'Alchemist’s Fire':['at the start of each of its turns','its action to make a DC'],
 'Antitoxin':['saving throws against poison','no benefit to undead or constructs'],
 'Ball Bearings':['level, square area','at half speed doesn’t need to make the save'],
 'Caltrops':['stop moving this turn','regains at least 1 hit point','at half speed doesn’t need to make the save'],
 'Healer’s Kit':['expend one use','to stabilize a creature','without needing to make a Wisdom (Medicine) check'],
 'Holy Water':['target is a fiend or undead','A cleric or paladin'],
 'Hunting Trap':['another creature within its reach','to the trapped creature'],
 'Oil':['provided that the surface is level','enters the area or ends its turn in the area','only once per turn'],
 'Poison, Basic':['one slashing or piercing weapon','up to three pieces of ammunition'],
 'Potion of Healing':['Drinking or administering a potion takes an action'],
 'Lock':['proficient with thieves’ tools'],
 'Manacles':['Small or Medium creature','proficient with thieves’ tools'],
 'Component Pouch':['except for those components that have a specific cost'],
 'Holy Symbol':['hold it in hand, wear it visibly, or bear it on a shield'],
}

def extract_parameter(text,heading,path,pattern,kind):
    words={'four':4,'twenty':20,'ten':10,'twice':2,'two':2}
    matches=re.findall(pattern,normalize(text))
    if len(matches)!=1:raise ValueError('Missing/ambiguous parameter: '+heading+' / '+path)
    value=matches[0]
    return int(value) if kind=='int' else words[value] if kind=='word' else value

def extracted_parameters(descriptions):
    result=[]
    for heading,path,pattern,kind in SPECS:
        result.append((heading,path,extract_parameter(descriptions[heading],heading,path,pattern,kind)))
    for heading,fragments in QUALIFIERS.items():
        for fragment in fragments:
            # PDF has occasional mid-word spaces; only known extraction artifacts are joined.
            text=descriptions[heading].replace('d amage','damage').replace('cre ature','creature')
            if fragment not in text:raise ValueError('Missing qualifier: '+heading+' / '+fragment)
    return result

def at_path(value,path):
    for key in path.split('.'):
        value=value[int(key)] if isinstance(value,list) else value[key]
    return value

def audit(manifest,descriptions,identities):
    if manifest['source']['sha256']!=SHA256 or manifest['ruleset']!='5e-2014' or manifest['accepted'] is not False or manifest['complete'] is not False or manifest['approvedDenominator'] is not None:
        raise ValueError('Invalid acceptance/source boundary')
    rows=manifest['records']
    if len(rows)!=42 or {r['heading'] for r in rows}!=set(HEADINGS) or len({r['proposalId'] for r in rows})!=42:
        raise ValueError('Missing or duplicate description')
    links=[id for r in rows for id in r['candidateItemIds']]
    original=[r['proposedCanonicalId'] for r in identities['records']]
    if len(links)!=52 or len(set(links))!=52 or any(original.count(id)!=1 for id in links):
        raise ValueError('Missing, duplicate or unknown item link')
    if any(r['accepted'] is not False or r['runtimeImported'] is not False for r in rows):
        raise ValueError('Unexpected runtime acceptance')
    for row in rows:
        if row['candidateItemIds']!=EXPECTED_ITEM_IDS[row['heading']]:raise ValueError('Item name/identity mismatch: '+row['heading'])
    by_name={r['heading']:r for r in rows}
    values=extracted_parameters(descriptions)
    for name,path,value in values:
        if at_path(by_name[name]['mechanics'],path)!=value:
            raise ValueError('Source parameter differs: '+name+' / '+path)
    return len(rows),len(values)

def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('pdf',type=Path);args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise ValueError('Unexpected SRD PDF hash')
    reader=PdfReader(args.pdf)
    descriptions=extract_descriptions(' '.join(reader.pages[i].extract_text() for i in [65,66,67]))
    load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
    rows,values=audit(load('srd51-adventuring-gear-conditions-2014.json'),descriptions,load('equipment-identity-reconciliation.json'))
    print(f'{rows}/42 bounded headings,52 existing item links and {values} numeric/dice parameters match SRD66-68; qualifiers checked, translations require semantic review')

if __name__=='__main__':main()
