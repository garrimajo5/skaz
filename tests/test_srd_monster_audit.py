import runpy
import unittest
from pathlib import Path

parse = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['statistics']
BASE = ('Beast Large beast, unaligned Armor Class 12 (natural armor) '
        'Hit Points 13 (2d10 + 2) Speed 30 ft., swim 30 ft. '
        'STR DEX CON INT WIS CHA 15 (+2) 14 (+2) 12 (+1) 1 (−5) 10 (+0) 3 (−4) '
        'Senses passive Perception 10 Languages — Challenge 1/4 (50 XP)')


class MonsterAuditTests(unittest.TestCase):
    def test_adult_legendary_rules_preserve_budget_timing_fear_immunity_and_wing_cost(self):
        import copy,json
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        source="Adult Black Dragon Huge dragon, chaotic evil Armor Class 19 Legendary Resistance (3/Day). If the dragon fails a saving throw, it can choose to succeed instead. Actions Frightful Presence. Each creature of the dragon's choice that is within 120 feet of the dragon and aware of it must succeed on a DC 16 Wisdom saving throw or become frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success. If a creature's saving throw is successful or the effect ends for it, the creature is immune to the dragon's Frightful Presence for the next 24 hours. Legendary Actions The dragon can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The dragon regains spent legendary actions at the start of its turn. Detect. The dragon makes a Wisdom (Perception) check. Tail Attack. The dragon makes a tail attack. Wing Attack (Costs 2 Actions). The dragon beats its wings. Each creature within 10 feet of the dragon must succeed on a DC 19 Dexterity saving throw or take 13 (2d6 + 6) bludgeoning damage and be knocked prone. The dragon can then fly up to half its flying speed."
        expected={'resistancePerDay':3,'fearRange':120,'fearSaveDC':16,'fearMinutes':1,'fearImmunityHours':24,'legendaryActions':3,'wingCost':2,'wingRadius':10,'wingSaveDC':19,'wingAverageDamage':13,'wingDamageDice':'2d6 + 6'}
        self.assertEqual(m['adult_dragon_legendary'](source,'Adult Black Dragon'),expected)
        root=Path(__file__).resolve().parents[1];full=json.loads((root/'catalog/srd51-chromatic-adults.coverage.json').read_text());manifest={**full,'legendaryChecks':full['legendaryChecks'][:1]};card=json.loads((root/'catalog/srd51-chromatic-adults.json').read_text())['entries'][0]
        pages={281:source,282:''};self.assertEqual(m['check_adult_legendary_inventory'](pages,manifest,[card]),1)
        for key,val in [('resistancePerDay',2),('fearRange',60),('fearSaveDC',17),('fearMinutes',2),('fearImmunityHours',12),('legendaryActions',2),('wingCost',1),('wingRadius',15),('wingSaveDC',20),('wingAverageDamage',14),('wingDamageDice','2d8 + 6')]:
            wrong=copy.deepcopy(manifest);wrong['legendaryChecks'][0]['legendary'][key]=val
            with self.assertRaises(ValueError):m['check_adult_legendary_inventory'](pages,wrong,[card])
        for old,new in [('3/день','3/ход'),('120 футов','60 футов'),('Мудрости Сл 16','Мудрости Сл 17'),('на 24 часа','на 12 часов'),('в конце хода другого','в начале хода другого'),('в начале своего хода','в конце своего хода'),('стоит 2 действия','стоит 1 действие'),('Ловкости Сл 19','Ловкости Сл 20'),('13 (2d6 + 6) дробящего','14 (2d6 + 6) дробящего'),('до половины своей скорости полёта','до своей скорости полёта')]:
            with self.assertRaises(ValueError):m['check_adult_legendary_inventory'](pages,manifest,[{**card,'text':card['text'].replace(old,new)}])
        for changed in [source.replace('only at the end of another', 'only at the start of another'),source.replace('at the start of its turn','at the end of its turn'),source.replace('at the end of each of its turns','at the start of each of its turns'),source+source[source.index('Legendary Resistance'):source.index(' Actions')],source.replace('Adult Black Dragon Huge dragon','Adult Black Dragon is described. Neighbor Huge dragon')]:
            with self.assertRaises(ValueError):m['adult_dragon_legendary'](changed,'Adult Black Dragon')
        with self.assertRaises(ValueError):m['check_adult_legendary_inventory']({281:source.replace('Costs 2 Actions','Costs 1 Actions'),282:''},manifest,[card])

    def test_metallic_traits_keep_saves_skills_immunity_senses_languages_and_amphibious_separate(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        source=BASE.replace('Large beast','Large dragon').replace('Senses passive Perception 10 Languages —','Saving Throws Dex +3, Con +7, Wis +4, Cha +6 Skills Insight +4, Perception +7, Stealth +3 Damage Immunities lightning Senses blindsight 30 ft., darkvision 120 ft., passive Perception 17 Languages Common, Draconic')+' Amphibious. The dragon can breathe air and water. Actions'
        value=m['metallic_traits'](source,'Beast')
        self.assertEqual(value,{'savingThrows':{'dex':3,'con':7,'wis':4,'cha':6},'skills':{'insight':4,'perception':7,'stealth':3},'damageImmunities':['lightning'],'senses':{'blindsight':30,'darkvision':120,'passivePerception':17},'languages':['Common','Draconic'],'amphibious':True})
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','nameEn':'Beast','pages':[295]}],'traitChecks':[{'monsterId':'source:beast','nameEn':'Beast','traits':value}]}
        card={'id':'source:beast','text':'Спасброски Ловкости +3, Телосложения +7, Мудрости +4, Харизмы +6. Навыки: Проницательность +4, Восприятие +7, Скрытность +3. Иммунитет к электрическому урону. Слепое зрение 30 футов, тёмное зрение 120 футов, пассивное Восприятие 17. Языки: Общий, Драконий. Амфибия: дышит воздухом и водой.'}
        self.assertEqual(m['check_metallic_trait_inventory']({295:source},manifest,[card]),1)
        for group,key,changed in [('savingThrows','con',6),('skills','insight',5),('senses','blindsight',10),('senses','darkvision',60),('senses','passivePerception',14)]:
            wrong=copy.deepcopy(manifest);wrong['traitChecks'][0]['traits'][group][key]=changed
            with self.assertRaises(ValueError):m['check_metallic_trait_inventory']({295:source},wrong,[card])
        for key,changed in [('damageImmunities',['fire']),('languages',['Draconic']),('amphibious',False)]:
            wrong=copy.deepcopy(manifest);wrong['traitChecks'][0]['traits'][key]=changed
            with self.assertRaises(ValueError):m['check_metallic_trait_inventory']({295:source},wrong,[card])
        for old,new in [('Телосложения +7','Телосложения +6'),('Восприятие +7','Восприятие +6'),('электрическому','огненному'),('Иммунитет','Сопротивление'),('30 футов','10 футов'),('120 футов','60 футов'),('Восприятие 17','Восприятие 14'),('Общий, Драконий','Драконий'),('Амфибия: дышит воздухом и водой.','')]:
            with self.assertRaises(ValueError):m['check_metallic_trait_inventory']({295:source},manifest,[{**card,'text':card['text'].replace(old,new)}])
        for changed in [source.replace('Dex +3','Dex +3, Dex +4'),source.replace('lightning','poison'),source.replace('Common, Draconic','Unknown'),source.replace('darkvision 120 ft., ',''),BASE.replace('Large beast','Large dragon')+source.replace('Beast Large','Neighbor Large')]:
            with self.assertRaises(ValueError):m['metallic_traits'](changed,'Beast')
        # A changed/missing skill remains parseable, but must fail the declared source comparison.
        with self.assertRaises(ValueError):m['check_metallic_trait_inventory']({295:source.replace('Insight +4, ','')},manifest,[card])

    def test_secondary_breath_sleep_source_and_authored_fields_are_bounded_and_exact(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        parent=' Breath Weapons (Recharge 5–6). The dragon uses one of the following breath weapons. '
        action='Sleep Breath. The dragon exhales sleep gas in a 30-foot cone. Each creature in that area must succeed on a DC 14 Constitution saving throw or fall unconscious for 5 minutes. This effect ends for a creature if the creature takes damage or someone uses an action to wake it.'
        source=BASE+parent+action;value=m['dragon_secondary_breath'](source,'Beast','Sleep Breath')
        self.assertEqual(value,{'nameEn':'Sleep Breath','recharge':[5,6],'shape':'cone','length':30,'saveAbility':'con','saveDC':14,'effect':'sleep','durationMinutes':5,'pushFeet':None,'repeatAtEndOfTurn':False,'wakeOnDamage':True,'wakeWithAction':True})
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','nameEn':'Beast','pages':[292]}],'secondaryBreathChecks':[{'monsterId':'source:beast','nameEn':'Beast','breath':value}]}
        card={'id':'source:beast','text':'Усыпляющее дыхание: конус 30 футов, Телосложение Сл 14; при провале бессознательность на 5 минут. Прекращается от урона или если кто-то действием разбудит его.'}
        self.assertEqual(m['check_secondary_breath_inventory']({292:source},manifest,[card]),1)
        for key,changed in [('recharge',[6,6]),('shape','line'),('length',15),('saveDC',11),('saveAbility','str'),('effect','paralyze'),('durationMinutes',1),('pushFeet',30),('repeatAtEndOfTurn',True),('wakeOnDamage',False),('wakeWithAction',False)]:
            wrong=copy.deepcopy(manifest);wrong['secondaryBreathChecks'][0]['breath'][key]=changed
            with self.assertRaises(ValueError):m['check_secondary_breath_inventory']({292:source},wrong,[card])
        for changed in [card['text'].replace('30 футов','15 футов'),card['text'].replace('Сл 14','Сл 11'),card['text'].replace('на 5 минут','на 1 минуту'),card['text'].replace('от урона',''),card['text'].replace('действием','бонусным действием')]:
            with self.assertRaises(ValueError):m['check_secondary_breath_inventory']({292:source},manifest,[{**card,'text':changed}])
        wrong=copy.deepcopy(manifest);wrong['secondaryBreathChecks']*=2
        with self.assertRaises(ValueError):m['check_secondary_breath_inventory']({292:source},wrong,[card])
        for invalid in [BASE+action,source+parent,source+action,BASE+action+parent,BASE+BASE.replace('Beast Large','Neighbor Large')+parent+action,source.replace('uses an action','uses a bonus action'),source.replace('Constitution','Strength')]:
            with self.assertRaises(ValueError):m['dragon_secondary_breath'](invalid,'Beast','Sleep Breath')

    def test_secondary_control_breaths_preserve_push_strength_only_and_end_of_own_turn(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        parent=' Breath Weapons (Recharge 5–6). The dragon uses one of the following breath weapons. '
        actions=[
          ('Repulsion Breath','repulsion energy in a 30-foot cone. Each creature in that area must succeed on a DC 15 Strength saving throw. On a failed save, the creature is pushed 40 feet away from the dragon.','push',None,40,False),
          ('Slowing Breath',"gas in a 30-foot cone. Each creature in that area must succeed on a DC 14 Constitution saving throw. On a failed save, the creature can't use reactions, its speed is halved, and it can't make more than one attack on its turn. In addition, the creature can use either an action or a bonus action on its turn, but not both. These effects last for 1 minute. The creature can repeat the saving throw at the end of each of its turns, ending the effect on itself with a successful save.",'slow',1,None,True),
          ('Weakening Breath','gas in a 30-foot cone. Each creature in that area must succeed on a DC 17 Strength saving throw or have disadvantage on Strength-based attack rolls, Strength checks, and Strength saving throws for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.','weaken',1,None,True),
          ('Paralyzing Breath','paralyzing gas in a 30-foot cone. Each creature in that area must succeed on a DC 17 Constitution saving throw or be paralyzed for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.','paralyze',1,None,True)
        ]
        for name,body,effect,duration,push,repeat in actions:
            text=BASE+parent+name+'. The dragon exhales '+body;value=m['dragon_secondary_breath'](text,'Beast',name)
            self.assertEqual([value['effect'],value['durationMinutes'],value['pushFeet'],value['repeatAtEndOfTurn']],[effect,duration,push,repeat])
            self.assertFalse(value['wakeWithAction']);self.assertFalse(value['wakeOnDamage'])
            if repeat:
                with self.assertRaises(ValueError):m['dragon_secondary_breath'](text.replace('at the end of each of its turns','at the start of each of its turns'),'Beast',name)
                with self.assertRaises(ValueError):m['dragon_secondary_breath'](text.replace('ending the effect on itself','keeping the effect on itself'),'Beast',name)
        slow=BASE+parent+'Slowing Breath. The dragon exhales '+actions[1][1]
        for changed in [slow.replace('but not both','including both'),slow.replace('more than one attack','more than two attacks'),slow.replace('speed is halved','speed is doubled')]:
            with self.assertRaises(ValueError):m['dragon_secondary_breath'](changed,'Beast','Slowing Breath')

    def test_metallic_breath_inherits_only_explicit_parent_recharge_in_same_creature(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        parent=' Breath Weapons (Recharge 5–6). The dragon uses one of the following breath weapons. '
        damage='Fire Breath. The dragon exhales fire in a 40-foot line that is 5 feet wide. Each creature in that line must make a DC 14 Dexterity saving throw, taking 42 (12d6) fire damage on a failed save, or half as much damage on a successful one.'
        sleep=' Sleep Breath. The dragon exhales sleep gas in a 30-foot cone. Each creature in that area must succeed on a DC 14 Constitution saving throw or fall unconscious for 5 minutes.'
        text=BASE+' Actions'+parent+damage+sleep
        result=m['dragon_breath'](text,'Beast','Fire Breath')
        self.assertEqual(result,{'nameEn':'Fire Breath','recharge':[5,6],'shape':'line','length':40,'width':5,'saveAbility':'dex','saveDC':14,'averageDamage':42,'damageDice':'12d6','damageType':'fire'})
        self.assertEqual(m['dragon_breath'](text.replace('40-foot','40-\u00ad\u2010 foot'),'Beast','Fire Breath'),result)
        self.assertEqual(m['dragon_breath'](text.replace(parent,parent.replace('5–6','4–6')),'Beast','Fire Breath')['recharge'],[4,6])
        # Condition breaths have no damage/half-save fields and remain unsupported here.
        with self.assertRaises(ValueError):m['dragon_breath'](text,'Beast','Sleep Breath')
        for invalid in [text.replace(parent,' '),BASE+' Actions'+damage+parent+sleep,text+parent,text+damage,BASE+BASE.replace('Beast Large','Neighbor Large')+parent+damage,text.replace(parent,parent+' Other Breath (Recharge 6–6). ')]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):m['dragon_breath'](invalid,'Beast','Fire Breath')

    def test_additional_melee_damage_keeps_dice_type_and_primary_damage_separate(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        action=' Bite. Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 15 (2d10 + 4) piercing damage plus 4 (1d8) acid damage.'
        text=BASE+' Actions'+action;extra=m['melee_additional_damage'](text,'Beast','Bite')
        self.assertEqual(extra,[{'averageDamage':4,'damageDice':'1d8','damageType':'acid'}])
        with_save=text.replace('acid damage.','acid damage, and the target must succeed on a DC 14 Constitution saving throw or become poisoned for 1 minute.')
        self.assertEqual(m['melee_additional_damage'](with_save,'Beast','Bite'),extra)
        attack={**m['melee_weapon_attack'](text,'Beast','Bite'),'additionalDamage':extra}
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','nameEn':'Beast','pages':[282]}],'weaponAttackChecks':[{'monsterId':'source:beast','nameEn':'Beast','attacks':[attack]}]}
        card={'id':'source:beast','text':'Укус: 15 (2d10 + 4) колющего плюс 4 (1d8) кислотного урона.'}
        self.assertEqual(m['check_melee_weapon_inventory']({282:text},manifest,[card]),1)
        for key,value in [('averageDamage',5),('damageDice','1d10'),('damageType','fire')]:
            wrong=copy.deepcopy(manifest);wrong['weaponAttackChecks'][0]['attacks'][0]['additionalDamage'][0][key]=value
            with self.assertRaises(ValueError):m['check_melee_weapon_inventory']({282:text},wrong,[card])
        for changed in [card['text'].replace('кислотного','огненного'),card['text'].replace('4 (1d8)','5 (1d10)')]:
            with self.assertRaises(ValueError):m['check_melee_weapon_inventory']({282:text},manifest,[{**card,'text':changed}])
        for changed in [text.replace(' plus 4 (1d8) acid damage',''),BASE+BASE.replace('Beast Large','Neighbor Large')+action,text+action]:
            with self.assertRaises(ValueError):m['melee_additional_damage'](changed,'Beast','Bite')
        with self.assertRaises(ValueError):m['melee_additional_damage'](text.replace(' plus 4 (1d8) acid damage',', or 20 (3d10) piercing damage if held in two hands'),'Beast','Bite')

    def test_dragon_breath_preserves_geometry_save_recharge_and_damage_with_pdf_hyphens(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        action=' Acid Breath (Recharge 5–6). The dragon exhales acid in a 30-\u00ad\u2010foot line that is 5 feet wide. Each creature in that line must make a DC 14 Dexterity saving throw, taking 49 (11d8) acid damage on a failed save, or half as much damage on a successful one.'
        text=BASE+' Actions'+action;value=m['dragon_breath'](text,'Beast','Acid Breath')
        self.assertEqual(value,{'nameEn':'Acid Breath','recharge':[5,6],'shape':'line','length':30,'width':5,'saveAbility':'dex','saveDC':14,'averageDamage':49,'damageDice':'11d8','damageType':'acid'})
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','nameEn':'Beast','pages':[282]}],'breathChecks':[{'monsterId':'source:beast','nameEn':'Beast','breath':value}]}
        card={'id':'source:beast','text':'Кислотное дыхание (перезарядка 5–6): линия 30 футов шириной 5 футов, Ловкость Сл 14; 49 (11d8) кислотного урона при провале, половина при успехе.'}
        self.assertEqual(m['check_dragon_breath_inventory']({282:text},manifest,[card]),1)
        for key,val in [('recharge',[6,6]),('shape','cone'),('length',60),('width',10),('saveAbility','con'),('saveDC',15),('averageDamage',50),('damageDice','12d8'),('damageType','fire')]:
            wrong=copy.deepcopy(manifest);wrong['breathChecks'][0]['breath'][key]=val
            with self.assertRaises(ValueError):m['check_dragon_breath_inventory']({282:text},wrong,[card])
        for changed in [card['text'].replace('линия','конус'),card['text'].replace('Ловкость','Телосложение'),card['text'].replace('Сл 14','Сл 15'),card['text'].replace('кислотного','огненного'),card['text'].replace('49 (11d8) кислотного','49 (11d8) огненного')+' Другой эффект кислотного урона.']:
            with self.assertRaises(ValueError):m['check_dragon_breath_inventory']({282:text},manifest,[{**card,'text':changed}])
        wrong=copy.deepcopy(manifest);wrong['breathChecks']*=2
        with self.assertRaises(ValueError):m['check_dragon_breath_inventory']({282:text},wrong,[card])
        for bad in [BASE+BASE.replace('Beast Large','Neighbor Large')+action,text+action,text.replace('line that is 5 feet wide','line')]:
            with self.assertRaises(ValueError):m['dragon_breath'](bad,'Beast','Acid Breath')

    def test_dragon_turtle_steam_keeps_constitution_and_explicit_underwater_fire_exception(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+' Actions Steam Breath (Recharge 5–6). The dragon turtle exhales scalding steam in a 60-foot cone. Each creature in that area must make a DC 18 Constitution saving throw, taking 52 (15d6) fire damage on a failed save, or half as much damage on a successful one. Being underwater doesn’t grant resistance against this damage.'
        value=m['dragon_breath'](text,'Beast','Steam Breath');self.assertEqual(value['saveAbility'],'con');self.assertIsNone(value['width']);self.assertEqual(value['damageType'],'fire')
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','nameEn':'Beast','pages':[304]}],'breathChecks':[{'monsterId':'source:beast','nameEn':'Beast','breath':{**value,'underwaterResistance':False}}]}
        card={'id':'source:beast','text':'Паровое дыхание (перезарядка 5–6): конус 60 футов, Телосложение Сл 18; 52 (15d6) огненного урона при провале, половина при успехе. Нахождение под водой не даёт сопротивления этому урону.'}
        self.assertEqual(m['check_dragon_breath_inventory']({304:text},manifest,[card]),1)
        for changed in [text.replace('Being underwater doesn’t grant resistance against this damage.',''),text.replace('Constitution','Dexterity')]:
            with self.assertRaises(ValueError):m['check_dragon_breath_inventory']({304:changed},manifest,[card])
        with self.assertRaises(ValueError):m['check_dragon_breath_inventory']({304:text},manifest,[{**card,'text':card['text'].replace('не даёт','даёт')}])

    def test_shapechanger_medium_humanoid_prose_is_not_a_new_statblock_before_melee_actions(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        action=' Claw (Fiend Form Only). Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.'
        text=BASE+' Shapechanger. It becomes a Small or Medium humanoid, or its true form. Actions'+action
        self.assertEqual(m['melee_weapon_attack'](text,'Beast','Claw (Fiend Form Only)')['averageDamage'],6)
        with self.assertRaises(ValueError):m['melee_weapon_attack'](BASE+' Actions '+BASE.replace('Beast Large','Neighbor Large')+action,'Beast','Claw (Fiend Form Only)')

    def test_melee_attack_source_fields_reject_changed_bonus_reach_dice_and_wrong_block(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        action=' Fist. Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) bludgeoning damage.'
        text=BASE+' Actions'+action
        attack=m['melee_weapon_attack'](text,'Beast','Fist')
        self.assertEqual(attack,{'nameEn':'Fist','attackBonus':9,'reach':5,'averageDamage':7,'damageDice':'2d4 + 2','damageType':'bludgeoning'})
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','nameEn':'Beast','pages':[300]}],'weaponAttackChecks':[{'monsterId':'source:beast','nameEn':'Beast','attacks':[attack]}]}
        card={'id':'source:beast','text':'Кулак: 7 (2d4 + 2) дробящего.'}
        self.assertEqual(m['check_melee_weapon_inventory']({300:text},manifest,[card]),1)
        for key,value in [('attackBonus',8),('reach',10),('averageDamage',8),('damageDice','2d6 + 2'),('damageType','slashing')]:
            wrong=copy.deepcopy(manifest);wrong['weaponAttackChecks'][0]['attacks'][0][key]=value
            with self.assertRaises(ValueError):m['check_melee_weapon_inventory']({300:text},wrong,[card])
        wrong=copy.deepcopy(manifest);wrong['weaponAttackChecks'][0]['attacks']*=2
        with self.assertRaises(ValueError):m['check_melee_weapon_inventory']({300:text},wrong,[card])
        with self.assertRaises(ValueError):m['check_melee_weapon_inventory']({300:text},manifest,[{**card,'text':'Wrong damage 9 (2d6 + 2)'}])
        for changed in [BASE+BASE.replace('Beast Large','Neighbor Large')+action,text+action,text.replace('Melee Weapon','Ranged Spell')]:
            with self.assertRaises(ValueError):m['melee_weapon_attack'](changed,'Beast','Fist')

    def test_dragon_headings_keep_age_colour_wyrmlings_and_outside_section_species(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={280:'Black Dragon Ancient Black Dragon Gargantuan dragon.',281:'Adult Black Dragon Huge dragon. Young Black Dragon Large dragon.',282:'Black Dragon Wyrmling Medium dragon.',303:'Dragon Turtle Gargantuan dragon.',340:'Pseudodragon Tiny dragon.',356:'Wyvern Large dragon. Half-Red Dragon Veteran Medium humanoid.'}
        rows=m['dragon_headings'](pages)
        self.assertEqual([r['nameEn'] for r in rows],['Ancient Black Dragon','Adult Black Dragon','Young Black Dragon','Black Dragon Wyrmling','Dragon Turtle','Pseudodragon','Wyvern'])
        self.assertEqual(rows[0]['id'],'srd51:2014:monster:ancient-black-dragon')
        manifest={'ruleset':'5e-2014','sourceSha256':m['SHA256'],'sourcePageRange':[254,394],'sections':[{'monsterType':'dragon','expectedCount':7,'entries':rows}]}
        self.assertEqual(m['check_type_inventory'](pages,manifest,[],('dragon',),True),{'dragon':{'expected':7,'prepared':0}})
        wrong=copy.deepcopy(manifest);wrong['sections'][0]['entries'][0]['page']=281
        with self.assertRaises(ValueError):m['check_type_inventory'](pages,wrong,[],('dragon',),True)
        with self.assertRaises(ValueError):m['dragon_headings']({300:'Strange-Dragon Huge dragon.'})

    def test_innate_intelligence_is_read_from_source_not_inferred_from_charisma(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+" Innate Spellcasting. Its spellcasting ability is Intelligence (spell save DC 16). It can innately cast the following spells, requiring no material components: At will: darkness 1/day each: fly Magic Resistance."
        value=m['innate_spellcasting'](text,'Beast')
        self.assertEqual(value['ability'],'int');self.assertEqual(value['saveDC'],16)
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','pages':[271]}],'innateSpellcastingChecks':[{'monsterId':'source:beast','nameEn':'Beast',**value}]}
        spells=[{'id':'srd51:2014:spell:'+s,'name':{'en':s}} for s in ['darkness','fly']]
        card={'id':'source:beast','links':[s['id'] for s in spells],'text':'Врождённая магия: Интеллект, Сл 16, без материальных компонентов. Без ограничений — darkness; 1 раз в день каждое — fly.'}
        self.assertEqual(m['check_innate_spellcasting_inventory']({271:text},manifest,[card],spells),{'Beast':2})
        for changed in [card['text'].replace('Интеллект','Харизма'),card['text'].replace('Сл 16','Сл 15')]:
            with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({271:text},manifest,[{**card,'text':changed}],spells)
        wrong=copy.deepcopy(manifest);wrong['innateSpellcastingChecks'][0]['ability']='cha'
        with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({271:text},wrong,[card],spells)
        with self.assertRaises(ValueError):m['innate_spellcasting'](text.replace('Intelligence','Wisdom'),'Beast')

    def test_selected_pack_source_identity_pages_counts_duplicates_and_statistics_are_independent(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        row={'id':'source:beast','nameEn':'Beast','pages':[300]}
        manifest={'schemaVersion':1,'ruleset':'5e-2014','sourceSha256':m['SHA256'],'sourceUrl':'https://source.invalid/pdf','completeGameCatalog':False,'expectedSubsetCount':1,'entries':[row]}
        card={'id':row['id'],'ruleset':'5e-2014','name':{'en':'Beast'},'source':{'usage':'cc-by-4.0','url':manifest['sourceUrl']+'#page=300'},'monster':parse(BASE,'Beast')}
        check=m['check_selected_monster_manifest']
        self.assertEqual(check({300:BASE},manifest,[card]),1)
        for key,value in [('expectedSubsetCount',2),('completeGameCatalog',True),('sourceSha256','wrong'),('ruleset','5e-2024')]:
            wrong=copy.deepcopy(manifest);wrong[key]=value
            with self.assertRaises(ValueError):check({300:BASE},wrong,[card])
        for numbers in [[300,300],[301,300],[253],[395]]:
            wrong=copy.deepcopy(manifest);wrong['entries'][0]['pages']=numbers
            with self.assertRaises(ValueError):check({300:BASE},wrong,[card])
        wrong=copy.deepcopy(manifest);wrong['entries']*=2;wrong['expectedSubsetCount']=2
        with self.assertRaises(ValueError):check({300:BASE},wrong,[card])
        for changed in [[],[card,card],[{**card,'monster':{**card['monster'],'xp':100}}],[{**card,'source':{**card['source'],'url':manifest['sourceUrl']+'#page=301'}}],[{**card,'name':{'en':'Neighbor'}}]]:
            with self.assertRaises(ValueError):check({300:BASE},manifest,changed)

    def test_fiend_inventory_ignores_section_labels_preserves_slash_name_and_reports_missing(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={270:'Demons Balor Huge fiend (demon). Dretch Small fiend (demon).',274:'Devils Barbed Devil Medium fiend (devil).',349:'Succubus/Incubus Medium fiend (shapechanger).'}
        rows=m['fiend_headings'](pages)
        self.assertEqual([r['nameEn'] for r in rows],['Balor','Dretch','Barbed Devil','Succubus/Incubus'])
        self.assertEqual(rows[-1]['id'],'srd51:2014:monster:succubus-incubus')
        manifest={'ruleset':'5e-2014','sourceSha256':m['SHA256'],'sourcePageRange':[254,394],'sections':[{'monsterType':'fiend','expectedCount':4,'entries':rows}]}
        cards=[{'id':rows[0]['id'],'name':{'en':'Balor'},'monster':{'type':'fiend'},'source':{'url':'https://source.invalid/#page=270'}}]
        self.assertEqual(m['check_type_inventory'](pages,manifest,cards,('fiend',),True),{'fiend':{'expected':4,'prepared':1}})
        with self.assertRaises(ValueError):m['check_type_inventory'](pages,manifest,cards,('fiend',))
        for bad in [cards+cards,[{**cards[0],'monster':{'type':'fey'}}],[{**cards[0],'source':{'url':'https://source.invalid/#page=271'}}]]:
            with self.assertRaises(ValueError):m['check_type_inventory'](pages,manifest,bad,('fiend',),True)
        wrong=copy.deepcopy(manifest);wrong['sections'][0]['entries']=rows[:-1]
        with self.assertRaises(ValueError):m['check_type_inventory'](pages,wrong,cards,('fiend',),True)

    def test_innate_attack_bonus_cannot_be_borrowed_from_adjacent_creatures(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        parser=m['innate_spell_attack_bonus']
        other=BASE.replace('Beast Large','Neighbor Large')+' Innate Spellcasting. Its spellcasting ability is Charisma (spell save DC 14, +6 to hit with spell attacks).'
        self.assertIsNone(parser(other+BASE,'Beast'))
        self.assertIsNone(parser(BASE+other,'Beast'))
        self.assertEqual(parser(BASE+' Innate Spellcasting. Its spellcasting ability is Charisma (spell save DC 14, +6 to hit with spell attacks).'+other,'Beast'),6)

    def test_innate_attack_bonus_and_twice_daily_self_restriction_are_checked(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+" Innate Spellcasting. Its spellcasting ability is Charisma (spell save DC 14, +6 to hit with spell attacks). It can innately cast the following spells, requiring no material components: At will: magic missile 2/day each: plane shift (self only), sleep Magic Resistance."
        value=m['innate_spellcasting'](text,'Beast')
        self.assertEqual(value['groups'][1]['usesPerDay'],2)
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','pages':[319]}],'innateSpellcastingChecks':[{'monsterId':'source:beast','nameEn':'Beast','spellAttackBonus':6,**value}]}
        spells=[{'id':ref['id'],'name':{'en':ref['id'].split(':')[-1].replace('-',' ')}} for group in value['groups'] for ref in group['spells']]
        card={'id':'source:beast','links':[s['id'] for s in spells],'text':'Врождённая магия: Харизма, Сл 14, атака заклинанием +6, без материальных компонентов. Без ограничений — magic missile; 2 раза в день каждое — plane shift только на себя, sleep.'}
        self.assertEqual(m['check_innate_spellcasting_inventory']({319:text},manifest,[card],spells),{'Beast':3})
        for wrong in [card['text'].replace('+6','+5'),card['text'].replace('2 раза','1 раз'),card['text'].replace(' только на себя','')]:
            with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({319:text},manifest,[{**card,'text':wrong}],spells)
        wrong=copy.deepcopy(manifest);wrong['innateSpellcastingChecks'][0]['spellAttackBonus']=5
        with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({319:text},wrong,[card],spells)
        with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({319:text.replace('+6','+5')},manifest,[card],spells)

    def test_authored_innate_lists_preserve_unknown_dc_and_reject_changed_frequency(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text='Врождённая магия: Харизма, без материальных компонентов. Сл в источнике не указана. Без ограничений — light; 3 раза в день каждое — fly.'
        v=m['authored_innate_spellcasting'](text)
        self.assertIsNone(v['saveDC']);self.assertEqual(v['groups'][1]['usesPerDay'],3)
        self.assertNotEqual(v,m['authored_innate_spellcasting'](text.replace('3 раза','1 раз')))
        self.assertNotEqual(v,m['authored_innate_spellcasting'](text.replace('Харизма,','Харизма, Сл 15,')))

    def test_aberration_inventory_keeps_canonical_names_and_excludes_monstrosities(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={261:'Aboleth Large aberration.',267:'Chuul Large aberration.',268:'Cloaker Large aberration.',314:'Gibbering Mouther Medium aberration.',339:'Otyugh Large aberration. Roper Large monstrosity. Mimic Medium monstrosity.'}
        rows=m['type_headings'](pages,'aberration')
        self.assertEqual([r['nameEn'] for r in rows],['Aboleth','Chuul','Cloaker','Gibbering Mouther','Otyugh'])
        manifest={'ruleset':'5e-2014','sourceSha256':m['SHA256'],'sourcePageRange':[254,394],'sections':[{'monsterType':'aberration','expectedCount':5,'entries':rows}]}
        cards=[{'id':r['id'],'name':{'en':r['nameEn']},'monster':{'type':'aberration'},'source':{'url':'https://source.invalid/#page='+str(r['page'])}} for r in rows]
        self.assertEqual(m['check_type_inventory'](pages,manifest,cards,('aberration',)),{'aberration':5})
        for bad in [cards[:-1],cards+cards[:1],[{**cards[0],'monster':{'type':'monstrosity'}},*cards[1:]]]:
            with self.assertRaises(ValueError):m['check_type_inventory'](pages,manifest,bad,('aberration',))

    def test_giant_type_inventory_includes_named_giants_and_kin_outside_the_section(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={308:'Ettin Large giant.',312:'Giants Cloud Giant Huge giant. Fire Giant Huge giant.',313:'Frost Giant Huge giant. Hill Giant Huge giant. Stone Giant Huge giant. Storm Giant Huge giant.',336:'Ogre Large giant. Oni Large giant.',351:'Troll Large giant.'}
        rows=m['type_headings'](pages,'giant')
        self.assertEqual(len(rows),10);self.assertEqual(rows[1]['nameEn'],'Cloud Giant')
        self.assertEqual([r['nameEn'] for r in rows[-3:]],['Ogre','Oni','Troll'])

    def test_innate_missing_dc_is_unknown_and_following_magic_weapon_trait_is_not_a_spell(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+" Innate Spellcasting. The beast's innate spellcasting ability is Charisma. It can innately cast the following spells, requiring no material components: At will: light 1/day each: fly Magic Weapons. The beast's attacks are magical. Regeneration. 10 hit points. Actions Bite."
        value=m['innate_spellcasting'](text,'Beast')
        self.assertIsNone(value['saveDC']);self.assertEqual(value['groups'][1]['spells'],[{'id':'srd51:2014:spell:fly','target':None}])

    def test_innate_casting_preserves_frequency_components_and_self_restriction(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+" Innate Spellcasting. The beast's spellcasting ability is Charisma (spell save DC 20). It can innately cast the following spells, requiring no material components: At will: detect evil and good, invisibility (self only) 3/day each: raise dead Magic Resistance."
        value=m['innate_spellcasting'](text,'Beast')
        self.assertEqual(value['saveDC'],20);self.assertEqual(value['components'],'no-material')
        self.assertEqual([g['usesPerDay'] for g in value['groups']],[None,3])
        self.assertEqual(value['groups'][0]['spells'][1],{'id':'srd51:2014:spell:invisibility','target':'self'})
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','pages':[311]}],'innateSpellcastingChecks':[{'monsterId':'source:beast','nameEn':'Beast',**value}]}
        spells=[{'id':ref['id'],'name':{'en':ref['id'].split(':')[-1].replace('-',' ')}} for group in value['groups'] for ref in group['spells']]
        cards=[{'id':'source:beast','links':[s['id'] for s in spells],'text':'Врождённая магия: Харизма, Сл 20, без материальных компонентов. Без ограничений — detect evil and good, invisibility только на себя; 3 раза в день каждое — raise dead.'}]
        self.assertEqual(m['check_innate_spellcasting_inventory']({311:text},manifest,cards,spells),{'Beast':3})
        for key,val in [('saveDC',19),('components','verbal-only')]:
            wrong=copy.deepcopy(manifest);wrong['innateSpellcastingChecks'][0][key]=val
            with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({311:text},wrong,cards,spells)
        wrong=copy.deepcopy(manifest);wrong['innateSpellcastingChecks'][0]['groups'][0]['spells'][1]['target']=None
        with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({311:text},wrong,cards,spells)
        with self.assertRaises(ValueError):m['check_innate_spellcasting_inventory']({311:text},manifest,[{**cards[0],'text':'detect evil and good, invisibility; raise dead'}],spells)
        with self.assertRaises(ValueError):m['innate_spellcasting'](text.replace('3/day each:','At will:'),'Beast')

    def test_celestial_headings_ignore_the_angels_section_label_and_keep_both_pages(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={261:'Angels Deva Medium celestial.',262:'Planetar Large celestial. Solar Large celestial.',269:'Couatl Medium celestial.',340:'Pegasus Large celestial.',351:'Unicorn Large celestial.'}
        rows=m['type_headings'](pages,'celestial')
        self.assertEqual([r['nameEn'] for r in rows],['Deva','Planetar','Solar','Couatl','Pegasus','Unicorn'])
        manifest={'ruleset':'5e-2014','sourceSha256':m['SHA256'],'sourcePageRange':[254,394],'sections':[{'monsterType':'celestial','expectedCount':6,'entries':rows}]}
        cards=[{'id':r['id'],'name':{'en':r['nameEn']},'monster':{'type':'celestial'},'source':{'url':'https://source.invalid/#page='+str(r['page'])}} for r in rows]
        self.assertEqual(m['check_type_inventory'](pages,manifest,cards,('celestial',)),{'celestial':6})
        for bad in [cards[:-1],cards+cards[:1],[{**cards[0],'monster':{'type':'fiend'}},*cards[1:]]]:
            with self.assertRaises(ValueError):m['check_type_inventory'](pages,manifest,bad,('celestial',))
        wrong=copy.deepcopy(manifest);wrong['sections'][0]['entries'][2]['page']=263
        with self.assertRaises(ValueError):m['check_type_inventory'](pages,wrong,cards,('celestial',))

    def test_prepared_caster_list_preserves_levels_slots_and_spell_ids(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+' Spellcasting. The beast has the following wizard spells prepared: Cantrips (at will): mage hand, ray of frost 1st level (4 slots): shield, magic missile 6th level (1 slot): harm Actions Bite.'
        rows=m['spellcasting_levels'](text,'Beast')
        self.assertEqual([r['level'] for r in rows],[0,1,6])
        self.assertEqual([r['slots'] for r in rows],[None,4,1])
        self.assertEqual(rows[0]['spellIds'],['srd51:2014:spell:mage-hand','srd51:2014:spell:ray-of-frost'])
        with self.assertRaises(ValueError):m['spellcasting_levels'](text.replace('6th level','1st level'),'Beast')
        with self.assertRaises(ValueError):m['spellcasting_levels'](BASE+' Other Medium undead '+text,'Beast')

    def test_caster_manifest_rejects_wrong_slots_missing_link_or_missing_authored_spell(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+' Spellcasting. The beast has the following cleric spells prepared: Cantrips (at will): mage hand 6th level (1 slot): harm Actions Bite.'
        levels=m['spellcasting_levels'](text,'Beast')
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','pages':[311]}],'spellcastingChecks':[{'monsterId':'source:beast','nameEn':'Beast','levels':levels}]}
        cards=[{'id':'source:beast','name':{'en':'Beast'},'links':['srd51:2014:spell:mage-hand','srd51:2014:spell:harm'],'text':'mage hand, harm'}]
        spells=[{'id':'srd51:2014:spell:mage-hand','name':{'en':'Mage Hand'},'spell':{'level':0}},{'id':'srd51:2014:spell:harm','name':{'en':'Harm'},'spell':{'level':6}}]
        self.assertEqual(m['check_spellcasting_inventory']({311:text},manifest,cards,spells),{'Beast':2})
        wrong=copy.deepcopy(manifest);wrong['spellcastingChecks'][0]['levels'][1]['slots']=2
        with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},wrong,cards,spells)
        for bad in [[{**cards[0],'links':cards[0]['links'][:1]}],[{**cards[0],'text':'mage hand only'}],[{**cards[0],'text':'mage hand and charm'}]]:
            with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},manifest,bad,spells)
        with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},manifest,cards,spells[:1])
        wrong_spells=copy.deepcopy(spells);wrong_spells[1]['spell']['level']=5
        with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},manifest,cards,wrong_spells)

    def test_undead_source_inventory_keeps_gaps_and_rejects_false_prepared_cards(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={311:'Ghouls Ghast Medium undead.',346:'Skeletons Skeleton Medium undead. Minotaur Skeleton Large undead.',355:"Will-\u00ad\u2010o’-\u00ad\u2010Wisp Tiny undead. Wraith Medium undead.",356:'Zombies Zombie Medium undead.'}
        rows=m['undead_headings'](pages)
        self.assertEqual([r['nameEn'] for r in rows],['Ghast','Skeleton','Minotaur Skeleton','Will-o’-Wisp','Wraith','Zombie'])
        manifest={'sourceSha256':m['SHA256'],'ruleset':'5e-2014','sourcePageRange':[254,394],'expectedCount':6,'entries':rows}
        cards=[{'id':r['id'],'name':{'en':r['nameEn']},'monster':{'type':'undead'},'source':{'url':'https://source.invalid/#page='+str(r['page'])}} for r in rows[:2]]
        self.assertEqual(m['check_undead_inventory'](pages,manifest,cards),{'expected':6,'prepared':2})
        for bad in [cards+cards[:1],[{**cards[0],'monster':{'type':'beast'}}]]:
            with self.assertRaises(ValueError):m['check_undead_inventory'](pages,manifest,bad)
        wrong=copy.deepcopy(manifest);wrong['entries'][0]['page']=312
        with self.assertRaises(ValueError):m['check_undead_inventory'](pages,wrong,cards)
        wrong=copy.deepcopy(manifest);wrong['entries'].pop()
        with self.assertRaises(ValueError):m['check_undead_inventory'](pages,wrong,cards)

    def test_compound_creature_name_normalizes_pdf_discretionary_hyphens(self):
        text=BASE.replace('Beast Large beast',"Will-\u00ad\u2010o’-\u00ad\u2010Wisp Large undead")
        self.assertEqual(parse(text,"Will-o’-Wisp")['hitPoints'],13)
        with self.assertRaises(ValueError):parse(text,'Willow Wisp')

    def test_construct_inventory_spans_sections_without_importing_their_labels(self):
        import copy
        module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={263:'Animated Objects Animated Armor Medium construct.',264:'Rug of Smothering Large construct.',315:'Golems Clay Golem Large construct.',317:'Iron Golem Large construct. Gorgon Large monstrosity.'}
        rows=module['type_headings'](pages,'construct')
        self.assertEqual([r['nameEn'] for r in rows],['Animated Armor','Rug of Smothering','Clay Golem','Iron Golem'])
        manifest={'sourceSha256':module['SHA256'],'ruleset':'5e-2014','sourcePageRange':[254,394],'sections':[{'monsterType':'construct','expectedCount':4,'entries':rows}]}
        cards=[{'id':r['id'],'name':{'en':r['nameEn']},'monster':{'type':'construct'},'source':{'url':'https://source.invalid/#page='+str(r['page'])}} for r in rows]
        self.assertEqual(module['check_type_inventory'](pages,manifest,cards,('construct',)),{'construct':4})
        for bad in [cards[:3],cards+cards[:1],[{**cards[0],'monster':{'type':'fey'}},*cards[1:]]]:
            with self.assertRaises(ValueError):module['check_type_inventory'](pages,manifest,bad,('construct',))
        broken=copy.deepcopy(manifest);broken['sections'][0]['entries'][2]['page']=316
        with self.assertRaises(ValueError):module['check_type_inventory'](pages,broken,cards,('construct',))
        with self.assertRaises(ValueError):module['check_type_inventory'](pages,manifest,cards)

    def test_animated_objects_include_compound_name_and_ignore_other_creature_types(self):
        module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={263:'Animated Objects Animated Armor Medium construct, unaligned.',264:'Flying Sword Small construct. Rug of Smothering Large construct. Ankheg Large monstrosity.'}
        rows=module['animated_headings'](pages)
        self.assertEqual([row['nameEn'] for row in rows],['Animated Armor','Flying Sword','Rug of Smothering'])
        self.assertEqual(rows[2]['id'],'srd51:2014:monster:rug-of-smothering')
        manifest={'sourceSha256':module['SHA256'],'expectedSubsetCount':3,'entries':[{**row,'pages':[row['page']]} for row in rows]}
        cards=[{'id':row['id'],'name':{'en':row['nameEn']},'monster':{'type':'construct'},'source':{'url':'https://source.invalid/#page='+str(row['page'])}} for row in rows]
        self.assertEqual(module['check_animated_coverage'](pages,manifest,cards),3)
        for invalid in [cards[:2],cards+cards[:1],[{**cards[0],'monster':{'type':'item'}},*cards[1:]]]:
            with self.assertRaises(ValueError):module['check_animated_coverage'](pages,manifest,invalid)
        manifest['entries'][0]['pages']=[264]
        with self.assertRaises(ValueError):module['check_animated_coverage'](pages,manifest,cards)

    def test_typed_headings_keep_pages_and_exclude_fiend_hags(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages = {320: 'Sea Hag Medium fey, chaotic evil. Night Hag Medium fiend, neutral evil.',
                 309: 'Fungi Shrieker Medium plant, unaligned. Violet Fungus Medium plant, unaligned.'}
        self.assertEqual(module['type_headings'](pages, 'fey'), [{'id':'srd51:2014:monster:sea-hag','nameEn':'Sea Hag','page':320}])
        plants = module['type_headings'](pages, 'plant')
        self.assertEqual([row['nameEn'] for row in plants], ['Shrieker','Violet Fungus'])
        self.assertEqual(plants[0]['id'], 'srd51:2014:monster:shrieker')
        self.assertEqual(module['type_headings'](pages, 'fiend')[0]['nameEn'], 'Night Hag')
        with self.assertRaises(ValueError): module['type_headings'](pages, 'beast')

    def test_typed_inventory_rejects_missing_duplicate_wrong_type_page_or_source(self):
        import copy
        module = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages = {304:'Dryad Medium fey, neutral.',309:'Fungi Shrieker Medium plant, unaligned.'}
        sections = [{'monsterType':kind,'expectedCount':1,'entries':module['type_headings'](pages,kind)} for kind in ['fey','plant']]
        manifest = {'sourceSha256':module['SHA256'],'ruleset':'5e-2014','sourcePageRange':[254,394],'sections':sections}
        cards = [{'id':s['entries'][0]['id'],'name':{'en':s['entries'][0]['nameEn']},'monster':{'type':s['monsterType']},'source':{'url':'https://source.invalid/#page='+str(s['entries'][0]['page'])}} for s in sections]
        self.assertEqual(module['check_type_inventory'](pages,manifest,cards), {'fey':1,'plant':1})
        for invalid in [cards[:1],cards+cards[:1],[{**cards[0],'monster':{'type':'fiend'}},cards[1]],[{**cards[0],'source':{'url':'https://source.invalid/#page=305'}},cards[1]]]:
            with self.assertRaises(ValueError): module['check_type_inventory'](pages,manifest,invalid)
        for mutate in [lambda x:x.update(sourceSha256='other'),lambda x:x.update(ruleset='5e-2024'),lambda x:x.update(sourcePageRange=[1,403]),lambda x:x['sections'][0].update(expectedCount=2),lambda x:x['sections'][0].update(entries=[])]:
            invalid = copy.deepcopy(manifest); mutate(invalid)
            with self.assertRaises(ValueError): module['check_type_inventory'](pages,invalid,cards)

    def test_ooze_section_inventory_ignores_prose_and_preserves_heading_pages(self):
        headings = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['ooze_headings']
        rows = headings({338:'Gray Ooze Medium ooze, unaligned. A Black Pudding is mentioned in prose.',337:'Black Pudding Large ooze, unaligned. Gelatinous Cube Large ooze, unaligned.'})
        self.assertEqual([row['nameEn'] for row in rows], ['Black Pudding','Gelatinous Cube','Gray Ooze'])
        self.assertEqual([row['page'] for row in rows], [337,337,338])
        self.assertEqual(rows[1]['id'], 'srd51:2014:monster:gelatinous-cube')

    def test_ooze_coverage_rejects_missing_duplicate_wrong_page_or_type(self):
        import copy
        module = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        check = module['check_ooze_coverage']
        pages={337:'Black Pudding Large ooze, unaligned.'}
        row={'id':'srd51:2014:monster:black-pudding','nameEn':'Black Pudding','pages':[337]}
        manifest={'sourceSha256':module['SHA256'],'expectedSubsetCount':1,'entries':[row]}
        card={'id':row['id'],'name':{'en':row['nameEn']},'monster':{'type':'ooze'},'source':{'url':'https://source.invalid/#page=337'}}
        self.assertEqual(check(pages,manifest,[card]),1)
        for cards in [[],[card,card],[{**card,'monster':{'type':'beast'}}],[{**card,'source':{'url':'https://source.invalid/#page=338'}}]]:
            with self.assertRaises(ValueError):check(pages,manifest,cards)
        for mutate in [lambda m:m.update(expectedSubsetCount=0),lambda m:m.update(entries=[]),lambda m:m['entries'][0].update(pages=[338]),lambda m:m.update(sourceSha256='changed')]:
            invalid=copy.deepcopy(manifest);mutate(invalid)
            with self.assertRaises(ValueError):check(pages,invalid,[card])

    def test_familiar_forms_preserve_aliases_and_reject_missing_or_duplicate_names(self):
        headings = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['familiar_headings']
        text = 'animal form you choose: bat, cat, crab, frog (toad), hawk, lizard, octopus, owl, poisonous snake, fish (quipper), rat, raven, sea horse, spider, or weasel. Appearing'
        names = headings(text)
        self.assertEqual(len(names), 15)
        self.assertIn('Quipper', names)
        self.assertIn('Frog', names)
        for bad in [text.replace('bat, ', ''), text.replace('bat, ', 'cat, '), 'Other spell']:
            with self.assertRaises(ValueError):
                headings(bad)

    def test_npc_inventory_preserves_pages_and_compound_names(self):
        headings = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['npc_headings']
        rows = headings({397: 'Bandit Captain Medium humanoid, any race', 395: 'Acolyte Medium humanoid, any race'})
        self.assertEqual([row['nameEn'] for row in rows], ['Acolyte', 'Bandit Captain'])
        self.assertEqual(rows[1]['id'], 'srd51:2014:monster:bandit-captain')
        self.assertEqual(rows[1]['page'], 397)
        self.assertEqual(headings({395: 'Acolyte is mentioned in prose without a statblock.'}), [])

    def test_fractional_challenge_multiple_speeds_and_negative_modifiers(self):
        result = parse(BASE, 'Beast')
        self.assertEqual(result['challenge'], '1/4')
        self.assertEqual(result['xp'], 50)
        self.assertEqual(result['speed'], {'walk': 30, 'swim': 30})
        self.assertEqual(result['abilities'], {'str':15,'dex':14,'con':12,'int':1,'wis':10,'cha':3})

    def test_page_footer_and_thousands_separator(self):
        text = BASE.replace('STR DEX', 'System Reference Document 5.1 300 STR DEX').replace('1/4 (50 XP)', '6 (2,300 XP)')
        self.assertEqual(parse(text, 'Beast')['xp'], 2300)

    def test_missing_fields_cannot_leak_from_neighbor(self):
        missing = BASE[:BASE.index('Challenge')]
        with self.assertRaises(ValueError):
            parse(missing + BASE.replace('Beast Large', 'Neighbor Small'), 'Beast')

    def test_unsupported_speed_and_missing_ability_are_not_silently_accepted(self):
        for text in [BASE.replace('swim 30 ft.', 'fly 30 ft. (unknown)'), BASE.replace('swim 30 ft.', 'swim 30 ft. (hover)'), BASE.replace('3 (−4)', '')]:
            with self.assertRaises(ValueError):
                parse(text, 'Beast')

    def test_hover_preserves_zero_ground_speed_and_flying_speed(self):
        text = BASE.replace('30 ft., swim 30 ft.', '0 ft., fly 90 ft. (hover)')
        self.assertEqual(parse(text, 'Beast')['speed'], {'walk': 0, 'fly': 90})


if __name__ == '__main__':
    unittest.main()
