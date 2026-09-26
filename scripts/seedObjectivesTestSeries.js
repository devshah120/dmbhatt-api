/**
 * Creates one 100-mark Objectives Test Series paper (100 MCQs, 1 mark each)
 * for GSEB Std 10 Science.
 *
 * Usage:
 *   node scripts/seedObjectivesTestSeries.js --dry-run          # validate only, no DB writes
 *   node scripts/seedObjectivesTestSeries.js                    # insert, available immediately
 *   node scripts/seedObjectivesTestSeries.js --medium=Gujarati
 *   node scripts/seedObjectivesTestSeries.js --start=2026-09-25T20:00+05:30
 *
 * With --start the paper stays locked until that time and a push notification
 * to the standard is queued for the same moment, as when saved from the admin.
 */
const mongoose = require('mongoose');
const ObjectivesTestSeries = require('../models/ObjectivesTestSeries');
const ScheduledNotification = require('../models/ScheduledNotification');
require('dotenv').config();

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
}));

const PAPER = {
    title: args.title || 'Science Objective Test Series – Paper 1 (100 Marks)',
    description: 'Full-syllabus board-pattern paper: 100 MCQs, 1 mark each. Covers chemical reactions, acids-bases-salts, metals, carbon compounds, life processes, control and coordination, reproduction, heredity, light, the human eye, electricity, magnetism and our environment.',
    board: 'GSEB',
    std: '10',
    medium: args.medium || 'English',
    stream: 'None',
    subject: 'Science',
    duration: 120
};

// [question, correct answer, [three wrong options], explanation]
const BANK = [
    // Chemical reactions and equations
    ['Which of the following is a combination reaction?', 'CaO + H₂O → Ca(OH)₂', ['CaCO₃ → CaO + CO₂', 'Zn + CuSO₄ → ZnSO₄ + Cu', 'NaOH + HCl → NaCl + H₂O'], 'Two reactants combine to form a single product.'],
    ['When an iron nail is placed in copper sulphate solution, the solution turns:', 'Light green', ['Red', 'Colourless', 'Dark blue'], 'Iron displaces copper and forms ferrous sulphate, which is light green.'],
    ['The decomposition of silver chloride in sunlight is an example of:', 'Photolytic decomposition', ['Thermal decomposition', 'Electrolytic decomposition', 'Double displacement'], 'Light supplies the energy: 2AgCl → 2Ag + Cl₂.'],
    ['Rancidity of fats and oils in food is caused by:', 'Oxidation', ['Reduction', 'Neutralisation', 'Sublimation'], 'Oxidised fats and oils develop an unpleasant smell and taste.'],
    ['Which gas is released when zinc reacts with dilute sulphuric acid?', 'Hydrogen', ['Oxygen', 'Carbon dioxide', 'Sulphur dioxide'], 'Zn + H₂SO₄ → ZnSO₄ + H₂.'],
    ['In the reaction CuO + H₂ → Cu + H₂O, the substance that gets oxidised is:', 'H₂', ['CuO', 'Cu', 'H₂O'], 'Hydrogen gains oxygen to form water, so it is oxidised.'],
    ['Decomposition of calcium carbonate into calcium oxide and carbon dioxide is:', 'An endothermic reaction', ['An exothermic reaction', 'A displacement reaction', 'A neutralisation reaction'], 'Heat must be supplied continuously for the reaction to occur.'],
    ['The reaction BaCl₂ + Na₂SO₄ → BaSO₄ + 2NaCl is a:', 'Double displacement reaction', ['Combination reaction', 'Decomposition reaction', 'Single displacement reaction'], 'The ions are exchanged and a white precipitate of BaSO₄ forms.'],

    // Acids, bases and salts
    ['The pH of a neutral solution at 25 °C is:', '7', ['0', '1', '14'], 'pH 7 is neutral; below 7 is acidic and above 7 is basic.'],
    ['The chemical formula of baking soda is:', 'NaHCO₃', ['Na₂CO₃', 'NaOH', 'CaCO₃'], 'Baking soda is sodium hydrogencarbonate.'],
    ['Plaster of Paris is chemically:', 'CaSO₄·½H₂O', ['CaSO₄·2H₂O', 'CaCO₃', 'Ca(OH)₂'], 'It is calcium sulphate hemihydrate; gypsum is the dihydrate.'],
    ['The chemical formula of washing soda is:', 'Na₂CO₃·10H₂O', ['NaHCO₃', 'Na₂CO₃', 'NaCl·2H₂O'], 'Washing soda is sodium carbonate decahydrate.'],
    ['In the chlor-alkali process, which gas is produced at the anode?', 'Chlorine', ['Hydrogen', 'Oxygen', 'Nitrogen'], 'Chlorine forms at the anode and hydrogen at the cathode.'],
    ['An antacid used to relieve acidity usually contains:', 'Magnesium hydroxide', ['Acetic acid', 'Sodium chloride', 'Calcium sulphate'], 'Milk of magnesia is a mild base that neutralises excess stomach acid.'],
    ['Tooth decay starts when the pH of the mouth falls below:', '5.5', ['7.5', '8.5', '6.5'], 'Below pH 5.5 the acid starts to corrode tooth enamel.'],
    ['The acid present in an ant sting is:', 'Methanoic acid', ['Citric acid', 'Oxalic acid', 'Lactic acid'], 'Methanoic (formic) acid causes the pain and irritation.'],
    ['Bleaching powder is prepared by passing chlorine gas over:', 'Dry slaked lime', ['Limestone', 'Gypsum', 'Common salt'], 'Ca(OH)₂ + Cl₂ → CaOCl₂ + H₂O.'],

    // Metals and non-metals
    ['Which metal is a liquid at room temperature?', 'Mercury', ['Sodium', 'Tungsten', 'Aluminium'], 'Mercury is the only metal that is liquid at room temperature.'],
    ['Which non-metal is a good conductor of electricity?', 'Graphite', ['Sulphur', 'Iodine', 'Phosphorus'], 'Graphite has free electrons between its layers.'],
    ['Which metal is stored under kerosene?', 'Sodium', ['Copper', 'Iron', 'Silver'], 'Sodium reacts vigorously with oxygen and moisture in air.'],
    ['The most malleable and ductile metal is:', 'Gold', ['Iron', 'Lead', 'Mercury'], 'Gold can be beaten into very thin sheets and drawn into fine wires.'],
    ['An alloy of copper and zinc is:', 'Brass', ['Bronze', 'Solder', 'Steel'], 'Bronze is copper and tin; solder is lead and tin.'],
    ['Galvanisation is the process of coating iron with:', 'Zinc', ['Tin', 'Chromium', 'Copper'], 'A zinc coating protects iron from rusting.'],
    ['Aqua regia is a mixture of concentrated HCl and concentrated HNO₃ in the ratio:', '3 : 1', ['1 : 3', '1 : 1', '2 : 1'], 'Aqua regia can dissolve gold and platinum.'],
    ['Which metal does not react with dilute hydrochloric acid?', 'Copper', ['Zinc', 'Magnesium', 'Iron'], 'Copper is below hydrogen in the reactivity series.'],
    ['Ionic compounds generally:', 'Have high melting points', ['Are volatile liquids', 'Do not conduct electricity when molten', 'Dissolve easily in kerosene'], 'Strong electrostatic forces between ions need a lot of energy to break.'],
    ['Solder is an alloy of:', 'Lead and tin', ['Copper and zinc', 'Copper and tin', 'Iron and carbon'], 'Its low melting point makes it useful for joining electrical wires.'],

    // Carbon and its compounds
    ['The number of covalent bonds in a molecule of methane is:', '4', ['2', '3', '5'], 'Carbon shares one electron pair with each of the four hydrogen atoms.'],
    ['The ability of carbon to form bonds with other carbon atoms, giving long chains, is called:', 'Catenation', ['Tetravalency', 'Isomerism', 'Allotropy'], 'Catenation gives rise to the huge number of carbon compounds.'],
    ['The functional group present in ethanol is:', '–OH', ['–COOH', '–CHO', '–CO–'], 'Ethanol, C₂H₅OH, is an alcohol.'],
    ['The IUPAC name of CH₃COOH is:', 'Ethanoic acid', ['Methanoic acid', 'Ethanol', 'Propanoic acid'], 'It has two carbon atoms and a carboxylic acid group.'],
    ['How many structural isomers does butane have?', '2', ['1', '3', '4'], 'n-butane and isobutane (2-methylpropane).'],
    ['The general formula of alkenes is:', 'CₙH₂ₙ', ['CₙH₂ₙ₊₂', 'CₙH₂ₙ₋₂', 'CₙHₙ'], 'Alkenes contain one carbon–carbon double bond.'],
    ['Esters are formed when a carboxylic acid reacts with:', 'An alcohol', ['An aldehyde', 'A base', 'A ketone'], 'This reaction, catalysed by an acid, is called esterification.'],
    ['Vegetable oil is converted into vanaspati ghee by:', 'Hydrogenation using a nickel catalyst', ['Oxidation using KMnO₄', 'Saponification', 'Esterification'], 'Hydrogen is added across the double bonds of unsaturated oils.'],
    ['Soaps are sodium or potassium salts of:', 'Long-chain carboxylic acids', ['Long-chain alcohols', 'Mineral acids', 'Short-chain esters'], 'The carboxylate end is water-loving and the long chain is oil-loving.'],
    ['Detergents are preferred over soaps in hard water because they:', 'Do not form scum with calcium and magnesium ions', ['Are cheaper than soap', 'Are natural products', 'Have no hydrocarbon tail'], 'Soaps react with Ca²⁺ and Mg²⁺ ions to form insoluble scum.'],
    ['Which allotrope of carbon is the hardest natural substance?', 'Diamond', ['Graphite', 'Fullerene', 'Coal'], 'Each carbon atom in diamond is bonded to four others in a rigid 3D network.'],

    // Life processes
    ['Photosynthesis takes place in the:', 'Chloroplast', ['Mitochondrion', 'Nucleus', 'Ribosome'], 'Chloroplasts contain chlorophyll, which absorbs light energy.'],
    ['The opening and closing of stomata is controlled by:', 'Guard cells', ['Epidermal hairs', 'Xylem vessels', 'Root hairs'], 'Guard cells swell and shrink as they gain or lose water.'],
    ['Bile is produced by the:', 'Liver', ['Gall bladder', 'Pancreas', 'Stomach'], 'Bile is made in the liver and stored in the gall bladder.'],
    ['During vigorous exercise, anaerobic respiration in muscle cells produces:', 'Lactic acid', ['Ethanol and carbon dioxide', 'Only water', 'Glucose'], 'The build-up of lactic acid causes muscle cramps.'],
    ['The energy currency of the cell is:', 'ATP', ['ADP', 'DNA', 'RNA'], 'Energy released in respiration is stored in ATP.'],
    ['The structural and functional unit of the kidney is the:', 'Nephron', ['Neuron', 'Alveolus', 'Villus'], 'Each kidney contains about a million nephrons that filter blood.'],
    ['Deoxygenated blood from the body enters the heart through the:', 'Right atrium', ['Left atrium', 'Left ventricle', 'Aorta'], 'The vena cava brings deoxygenated blood to the right atrium.'],
    ['Water and minerals are transported in plants through the:', 'Xylem', ['Phloem', 'Cambium', 'Cortex'], 'Xylem carries water from the roots to the leaves.'],
    ['The transport of food in plants (translocation) takes place through the:', 'Phloem', ['Xylem', 'Stomata', 'Root hairs'], 'Phloem carries sugars from the leaves to other parts of the plant.'],
    ['The enzyme in saliva that breaks down starch is:', 'Salivary amylase', ['Pepsin', 'Trypsin', 'Lipase'], 'Salivary amylase converts starch into sugar.'],
    ['Exchange of gases in the human lungs takes place in the:', 'Alveoli', ['Bronchi', 'Trachea', 'Larynx'], 'Alveoli have thin walls and a rich blood supply.'],
    ['Human beings show which mode of nutrition?', 'Holozoic', ['Autotrophic', 'Parasitic', 'Saprophytic'], 'Humans ingest, digest, absorb, assimilate and egest food.'],

    // Control and coordination
    ['The junction between two neurons is called a:', 'Synapse', ['Dendrite', 'Axon', 'Nephron'], 'Chemical signals cross the synapse to the next neuron.'],
    ['The part of the brain that maintains posture and balance is the:', 'Cerebellum', ['Cerebrum', 'Medulla', 'Hypothalamus'], 'The cerebellum coordinates voluntary movements and balance.'],
    ['Which plant hormone promotes cell division?', 'Cytokinin', ['Abscisic acid', 'Ethylene', 'Auxin'], 'Cytokinins are found in areas of rapid cell division such as fruits and seeds.'],
    ['The hormone that lowers the blood sugar level is:', 'Insulin', ['Adrenaline', 'Thyroxine', 'Glucagon'], 'Insulin is secreted by the pancreas.'],
    ['Iodine is needed by the thyroid gland to make:', 'Thyroxine', ['Insulin', 'Adrenaline', 'Growth hormone'], 'Iodine deficiency can cause goitre.'],
    ['The bending of a plant shoot towards light is called:', 'Phototropism', ['Geotropism', 'Hydrotropism', 'Chemotropism'], 'Auxin moves to the shaded side, making it grow faster.'],
    ['Which plant hormone inhibits growth and causes wilting of leaves?', 'Abscisic acid', ['Gibberellin', 'Auxin', 'Cytokinin'], 'Abscisic acid is a growth inhibitor.'],
    ['Reflex actions are mainly controlled by the:', 'Spinal cord', ['Cerebrum', 'Cerebellum', 'Pituitary gland'], 'The reflex arc passes through the spinal cord for a quick response.'],

    // How do organisms reproduce?
    ['Binary fission is seen in:', 'Amoeba', ['Hydra', 'Rhizopus', 'Bryophyllum'], 'The parent cell divides into two daughter cells.'],
    ['Budding is the mode of asexual reproduction in:', 'Hydra', ['Amoeba', 'Plasmodium', 'Spirogyra'], 'A bud develops on the body and detaches as a new individual.'],
    ['Vegetative propagation through leaves occurs in:', 'Bryophyllum', ['Rose', 'Potato', 'Banana'], 'Buds on the leaf margins grow into new plants.'],
    ['The male reproductive part of a flower is the:', 'Stamen', ['Pistil', 'Sepal', 'Ovary'], 'The stamen produces pollen grains.'],
    ['In humans, fertilisation normally takes place in the:', 'Fallopian tube (oviduct)', ['Uterus', 'Ovary', 'Cervix'], 'The zygote then moves down and implants in the uterus.'],
    ['After fertilisation, the ovary of a flower develops into the:', 'Fruit', ['Seed', 'Embryo', 'Petal'], 'The ovules develop into seeds.'],
    ['Which of the following is a sexually transmitted disease?', 'Syphilis', ['Typhoid', 'Malaria', 'Cholera'], 'Syphilis is a bacterial infection spread through sexual contact.'],
    ['The number of chromosomes in a human gamete is:', '23', ['46', '22', '44'], 'Gametes are haploid; fertilisation restores the number to 46.'],

    // Heredity
    ['Mendel performed his experiments on:', 'Garden pea', ['Fruit fly', 'Maize', 'Rose'], 'Pea plants have clearly contrasting traits and are easy to cross.'],
    ['In Mendel’s monohybrid cross, the F₂ phenotypic ratio is:', '3 : 1', ['1 : 2 : 1', '9 : 3 : 3 : 1', '1 : 1'], 'Three show the dominant trait and one the recessive trait.'],
    ['In Mendel’s dihybrid cross, the F₂ phenotypic ratio is:', '9 : 3 : 3 : 1', ['3 : 1', '1 : 2 : 1', '1 : 1 : 1 : 1'], 'Two traits are inherited independently of each other.'],
    ['In humans, the sex of a child is determined by:', 'Whether the father contributes an X or a Y chromosome', ['Whether the mother contributes an X or a Y chromosome', 'The mother’s diet', 'The temperature during pregnancy'], 'The mother always contributes an X; an X from the father gives a girl and a Y gives a boy.'],
    ['A human female has which pair of sex chromosomes?', 'XX', ['XY', 'YY', 'XO'], 'Males have XY.'],
    ['The units of heredity are called:', 'Genes', ['Chromatids', 'Ribosomes', 'Centrioles'], 'Genes are segments of DNA that control traits.'],
    ['Variations are most likely to arise through:', 'Sexual reproduction', ['Binary fission', 'Budding', 'Fragmentation'], 'DNA from two parents combines, creating new combinations.'],

    // Light: reflection and refraction
    ['The focal length of a plane mirror is:', 'Infinite', ['Zero', '1 m', 'Equal to the object distance'], 'A plane mirror can be treated as a spherical mirror of infinite radius.'],
    ['A concave mirror is commonly used as a:', 'Shaving mirror', ['Rear-view mirror in vehicles', 'Street-light reflector', 'Wide-angle security mirror'], 'Placed close to the face, it gives an enlarged, erect image.'],
    ['The mirror formula is:', '1/v + 1/u = 1/f', ['1/v − 1/u = 1/f', 'v + u = f', '1/u − 1/v = 1/f'], '1/v − 1/u = 1/f is the lens formula.'],
    ['The power of a convex lens of focal length 50 cm is:', '+2 D', ['+0.5 D', '−2 D', '+50 D'], 'P = 1/f (in metres) = 1/0.5 = +2 D.'],
    ['The refractive index of glass is 1.5. The speed of light in glass is:', '2 × 10⁸ m/s', ['3 × 10⁸ m/s', '1.5 × 10⁸ m/s', '4.5 × 10⁸ m/s'], 'v = c/n = (3 × 10⁸)/1.5 = 2 × 10⁸ m/s.'],
    ['The SI unit of the power of a lens is:', 'Dioptre', ['Metre', 'Watt', 'Joule'], '1 dioptre is the power of a lens with a focal length of 1 m.'],
    ['A convex mirror always forms an image that is:', 'Virtual, erect and diminished', ['Real, inverted and enlarged', 'Real, inverted and diminished', 'Virtual, erect and enlarged'], 'This wide view is why it is used as a rear-view mirror.'],

    // The human eye and the colourful world
    ['The ability of the eye lens to adjust its focal length is called:', 'Accommodation', ['Persistence of vision', 'Dispersion', 'Refraction'], 'The ciliary muscles change the curvature of the lens.'],
    ['Myopia (near-sightedness) is corrected using a:', 'Concave lens', ['Convex lens', 'Cylindrical lens', 'Plane glass'], 'A diverging lens moves the image back onto the retina.'],
    ['The splitting of white light into its component colours is called:', 'Dispersion', ['Reflection', 'Scattering', 'Total internal reflection'], 'A prism splits white light into the seven colours (VIBGYOR).'],
    ['The blue colour of the clear sky is due to:', 'Scattering of light', ['Dispersion of light', 'Reflection of light', 'Refraction of light'], 'Fine particles in air scatter blue light more than red light.'],
    ['The twinkling of stars is due to:', 'Atmospheric refraction', ['Reflection from clouds', 'Dispersion by the Moon', 'Scattering by dust only'], 'The changing refractive index of air makes starlight flicker.'],
    ['The least distance of distinct vision for a normal eye is about:', '25 cm', ['25 m', '2.5 cm', '250 cm'], 'This is the near point of a normal eye.'],

    // Electricity
    ['The SI unit of electric current is the:', 'Ampere', ['Volt', 'Ohm', 'Coulomb'], '1 A is a flow of 1 coulomb of charge per second.'],
    ['Three 6 Ω resistors are connected in parallel. Their equivalent resistance is:', '2 Ω', ['18 Ω', '3 Ω', '6 Ω'], '1/R = 1/6 + 1/6 + 1/6 = 1/2, so R = 2 Ω.'],
    ['The heating element of an electric heater is usually made of:', 'Nichrome', ['Copper', 'Tungsten', 'Silver'], 'Nichrome has high resistivity and does not oxidise easily when hot.'],
    ['1 kilowatt-hour (kWh) is equal to:', '3.6 × 10⁶ J', ['3.6 × 10³ J', '1000 J', '3.6 × 10⁵ J'], '1 kWh = 1000 W × 3600 s = 3.6 × 10⁶ J.'],
    ['According to Ohm’s law, at constant temperature:', 'V is directly proportional to I', ['V is inversely proportional to I', 'R is directly proportional to I', 'I is directly proportional to R'], 'V = IR, where R is constant.'],

    // Magnetic effects of electric current
    ['Fleming’s left-hand rule gives the direction of the:', 'Force on a current-carrying conductor in a magnetic field', ['Induced current in a coil', 'Magnetic field around a straight wire', 'Electric field between two charges'], 'The forefinger shows the field, the middle finger the current and the thumb the force.'],
    ['A device that converts mechanical energy into electrical energy is the:', 'Electric generator', ['Electric motor', 'Galvanometer', 'Electric fuse'], 'A generator works on electromagnetic induction.'],
    ['The magnetic field lines inside a long current-carrying solenoid are:', 'Parallel straight lines', ['Concentric circles', 'Absent', 'Random curves'], 'The field inside a solenoid is uniform.'],
    ['The frequency of the AC supply in Indian homes is:', '50 Hz', ['60 Hz', '220 Hz', '110 Hz'], 'The supply is 220 V at 50 Hz.'],

    // Our environment
    ['Which of the following is biodegradable?', 'Cow dung', ['Plastic bag', 'Glass bottle', 'Aluminium can'], 'Microorganisms can break down cow dung.'],
    ['The ozone layer protects us from:', 'Ultraviolet radiation', ['Infrared radiation', 'Visible light', 'Radio waves'], 'UV radiation can cause skin cancer.'],
    ['In a food chain, the energy passed on to the next trophic level is about:', '10%', ['1%', '50%', '90%'], 'This is the 10 per cent law.'],
    ['The chemicals mainly responsible for the depletion of the ozone layer are:', 'CFCs', ['Carbon dioxide', 'Oxygen', 'Nitrogen'], 'Chlorofluorocarbons were used in refrigerators and aerosol sprays.'],
    ['Organisms that make their own food using sunlight are called:', 'Producers', ['Consumers', 'Decomposers', 'Herbivores'], 'Green plants form the first trophic level.']
];

// Deterministic shuffle so the correct option is spread across A–D the same way on every run.
const mulberry32 = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const random = mulberry32(10);

const buildQuestions = () => BANK.map(([question, correct, wrong, explanation]) => {
    const options = [correct, ...wrong];
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    const letters = ['A', 'B', 'C', 'D'];
    return {
        question,
        optionA: options[0],
        optionB: options[1],
        optionC: options[2],
        optionD: options[3],
        correctAnswer: letters[options.indexOf(correct)],
        explanation
    };
});

const run = async () => {
    const questions = buildQuestions();
    if (questions.length !== 100) throw new Error(`Expected 100 questions, found ${questions.length}`);
    const duplicates = questions.filter((q, i) => questions.findIndex(o => o.question === q.question) !== i);
    if (duplicates.length) throw new Error(`Duplicate questions: ${duplicates.map(q => q.question).join(' | ')}`);

    const startAt = args.start ? new Date(args.start) : null;
    if (startAt && isNaN(startAt.getTime())) throw new Error(`Invalid --start value: ${args.start}`);

    const doc = new ObjectivesTestSeries({ ...PAPER, startAt, endAt: null, questions });
    await doc.validate();

    const spread = questions.reduce((acc, q) => ({ ...acc, [q.correctAnswer]: (acc[q.correctAnswer] || 0) + 1 }), {});
    console.log(`Paper: ${PAPER.title}`);
    console.log(`  ${PAPER.board} · Std ${PAPER.std} · ${PAPER.medium} · ${PAPER.subject} · ${PAPER.duration} min`);
    console.log(`  ${questions.length} questions = ${questions.length} marks · answers A/B/C/D: ${spread.A}/${spread.B}/${spread.C}/${spread.D}`);
    console.log(`  Opens: ${startAt ? startAt.toISOString() : 'immediately'}`);

    if (args['dry-run']) {
        console.log('Dry run: validated, nothing written.');
        return;
    }

    await mongoose.connect(process.env.MONGODB_URI);

    // Next free Display Order in this std/subject/medium/board/stream group.
    const top = await ObjectivesTestSeries.findOne({
        std: PAPER.std, subject: PAPER.subject, medium: PAPER.medium, board: PAPER.board, stream: PAPER.stream
    }).sort({ orderIndex: -1 });
    doc.orderIndex = top?.orderIndex ? top.orderIndex + 1 : 1;

    await doc.save();
    console.log(`Created paper ${doc._id} with Display Order ${doc.orderIndex}.`);

    if (startAt && startAt > new Date()) {
        await ScheduledNotification.create({
            title: 'New Test Series paper is live!',
            body: `${doc.title} (${doc.subject}) is now open. Attempt it now!`,
            std: doc.std,
            scheduledTime: startAt,
            sourceType: 'ObjectivesTestSeries',
            sourceId: doc._id
        });
        console.log(`Queued push notification to std_${doc.std} for ${startAt.toISOString()}.`);
    }
};

run()
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error('Seeding failed:', err.message);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
