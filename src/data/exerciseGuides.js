// src/data/exerciseGuides.js
// Fearne Hub :: how-to cues for exercises, shown behind the "How to" button
// in the tracker. Kept in code rather than in programme files because built-in
// programmes are copied into the database once and never refreshed, and so
// the same cues serve every programme (including uploaded ones) by name.
//
// Each family shares setup, cues and common mistakes; `variants` maps each
// exercise name to one line about what's particular to that version. Names
// are matched loosely (case, hyphens and plurals ignored), see guideFor(),
// so "Pull-up" and "Pull up", or "Wall push-up" and "Wall pushups", share
// one entry.

const FAMILIES = [
  // ======================================================================
  // Barbell
  // ======================================================================
  {
    variants: {
      "Back squat": "Bar on the upper back, squat to at least parallel (hip crease level with the knee) or lower if your back stays neutral.",
    },
    setup: [
      "Set the bar in the rack at mid-chest height and the safety pins just below your bottom position.",
      "Duck under, bar across the upper back (on the meaty part of the traps, not the neck), hands just outside the shoulders.",
      "Stand it up, take two or three small steps back, feet about shoulder width with toes turned out slightly.",
    ],
    cues: [
      "Big breath into the belly and brace before each rep, as if about to be poked in the stomach.",
      "Sit down between your heels, knees pushed out in line with the toes.",
      "Keep the whole foot planted, weight over mid-foot.",
      "Drive up by pushing the floor away, chest and hips rising together.",
    ],
    mistakes: [
      "Knees caving in on the way up.",
      "Hips shooting up first so it turns into a good morning.",
      "Heels lifting or weight drifting onto the toes.",
    ],
  },
  {
    variants: {
      "Bench press": "Bar to the lower chest, pressed back up over the shoulders.",
    },
    setup: [
      "Lie with eyes under the bar, feet flat on the floor.",
      "Squeeze shoulder blades together and down into the bench, small natural arch in the low back.",
      "Grip slightly wider than shoulder width, wrists stacked over elbows, thumbs wrapped round the bar.",
    ],
    cues: [
      "Unrack with straight arms and bring the bar over the shoulders before starting.",
      "Lower under control to the lower chest, elbows about 45 to 70 degrees from the body.",
      "Light touch, then press up and slightly back towards the rack.",
      "Keep the shoulder blades pinned and feet pushing into the floor throughout.",
    ],
    mistakes: [
      "Bouncing the bar off the chest.",
      "Elbows flared straight out to the sides.",
      "Bum lifting off the bench.",
      "Benching heavy without safeties or a spotter.",
    ],
  },
  {
    variants: {
      "Barbell row": "Torso hinged forward, bar pulled to the lower ribs or belly.",
    },
    setup: [
      "Bar over mid-foot, grip just outside the knees, overhand.",
      "Hinge at the hips with soft knees until the torso is around 45 degrees or lower, back flat.",
    ],
    cues: [
      "Brace the trunk so the torso doesn't move.",
      "Pull the bar to the lower ribs, driving the elbows back past the body.",
      "Squeeze the shoulder blades together at the top, then lower under control.",
    ],
    mistakes: [
      "Standing more upright each rep to heave the weight.",
      "Rounding the lower back.",
      "Shrugging the bar up with the neck instead of rowing with the back.",
    ],
  },
  {
    variants: {
      "Cable or band face pull": "Rope or band at head height, pulled towards the face.",
      "Band face pull": "Band anchored to the rack at head height.",
    },
    setup: [
      "Anchor at head height. Hold the ends with palms facing in or down.",
      "Step back until there's tension with the arms straight in front.",
    ],
    cues: [
      "Pull towards the eyes, elbows high and out to the sides.",
      "Finish with the hands beside the ears, as if showing off your biceps.",
      "Squeeze between the shoulder blades and pause for a second.",
      "Ribs down, no leaning back.",
    ],
    mistakes: [
      "Using too much weight and leaning back to move it.",
      "Elbows dropping so it becomes a row.",
      "Shrugging the shoulders up to the ears.",
    ],
  },
  {
    variants: {
      "Overhead press": "Standing barbell press from the front of the shoulders to overhead.",
    },
    setup: [
      "Bar in the rack at upper-chest height. Grip just outside the shoulders, wrists stacked over elbows.",
      "Unrack with the bar resting on the front of the shoulders, elbows slightly in front of the bar.",
      "Feet hip width, squeeze the glutes and brace the stomach.",
    ],
    cues: [
      "Tuck the chin back slightly and press straight up past the face.",
      "Once the bar passes the forehead, move the head through so the bar finishes over the middle of the foot.",
      "Lock out with the arms by the ears and shrug up a touch at the top.",
      "Lower under control back to the shoulders.",
    ],
    mistakes: [
      "Leaning back and turning it into an incline press.",
      "Pressing the bar out in front instead of straight up.",
      "Bending the knees to push it up.",
    ],
  },
  {
    variants: {
      "Deadlift": "Barbell from the floor to standing tall, then back down under control.",
    },
    setup: [
      "Bar over the middle of the foot, about an inch from the shins, feet hip width.",
      "Hinge down and grip just outside the legs.",
      "Bring the shins to the bar, chest up, back flat, shoulders slightly in front of the bar.",
    ],
    cues: [
      "Take the slack out of the bar first: pull up until it clicks without the plates leaving the floor.",
      "Big breath and brace, then push the floor away with the legs.",
      "Keep the bar dragging up the legs the whole way.",
      "Stand tall with the glutes squeezed. Don't lean back.",
      "Lower by pushing the hips back first, then bending the knees once the bar passes them.",
    ],
    mistakes: [
      "Rounding the lower back off the floor.",
      "Bar drifting away from the body.",
      "Jerking the bar off the floor without taking the slack out.",
      "Hyperextending backwards at the top.",
    ],
  },
  {
    variants: {
      "Farmer's carry": "A weight in each hand, walk tall.",
      "Farmer's carry, light dumbbells": "Around 4 to 6kg each hand.",
      "Farmer's carry, moderate dumbbells": "Around 8 to 10kg each hand.",
      "Farmer's carry, heavier dumbbells": "12kg plus each hand.",
      "Suitcase carry, one dumbbell": "Weight in one hand only, so the trunk has to stop you leaning. Do both sides.",
    },
    setup: [
      "Deadlift the weights up with a flat back. Don't bend over to grab them.",
      "Stand tall: shoulders back and down, ribs stacked over the pelvis.",
    ],
    cues: [
      "Short, quick, steady steps. Walk heel to toe.",
      "Grip hard and keep the arms long by your sides.",
      "Breathe steadily. Don't hold your breath for the whole walk.",
      "Set the weights down with the same flat back you picked them up with.",
    ],
    mistakes: [
      "Leaning towards (or away from) a weight.",
      "Shoulders creeping up to the ears.",
      "Bending over to drop the weights when the grip goes.",
    ],
  },

  // ======================================================================
  // Push-ups
  // ======================================================================
  {
    variants: {
      "Wall pushups": "Hands on a wall at shoulder height, feet a step or two back. The further back the feet, the harder it gets.",
      "Incline pushup": "Hands on a bench, table or step. The higher the hands, the easier it is.",
      "Incline push-up, rack bar at chest height": "Hands on the barbell in the rack at chest height. A wrist-friendly straight grip.",
      "Incline push-up, rack bar at hip height": "Bar lowered to hip height, so more of your body weight goes through the arms.",
      "Incline push-up, rack bar at mid-thigh height": "Bar at mid-thigh height. Keep the body line as you go lower.",
      "Incline push-up, rack bar at knee height": "Bar at knee height, nearly a floor push-up.",
      "Kneeling pushup": "From the knees, with hips in line between knees and shoulders, not bent at the hips.",
      "Half way pushup": "Full push-up position, lowering only halfway (elbows to about 90 degrees) and pressing back up.",
      "Normal pushup": "The full version: chest to a fist's height from the floor, then press to straight arms.",
      "Full push-up on push-up bars": "Hands on push-up bars keeps the wrists straight and lets you go a little deeper.",
      "Full push-up on push-up bars, higher reps": "Same full push-up, chasing more clean reps. Stop the set when the body line goes.",
      "Push-up negatives on push-up bars": "From the toes, lower over 3 to 5 seconds, then drop the knees to come back up.",
      "Elbows in pushups": "Elbows brushing the ribs on the way down, shifting the work towards the triceps.",
      "Diamond pushups": "Hands together under the chest, thumbs and index fingers making a diamond. Elbows stay close.",
      "Wide grip pushup": "Hands well outside the shoulders. Shorter range, more chest.",
      "Decline pushups": "Feet raised on a bench or step, which loads the upper chest and shoulders more.",
      "Decline diamond pushup": "Diamond hand position with the feet raised.",
      "Uneven pushups": "One hand on a raised object (a book or ball), the other on the floor. Do both sides.",
      "Uneven lever pushup": "One arm bent doing the push-up, the other almost straight out to the side as a lever. Do both sides.",
    },
    setup: [
      "Hands just outside shoulder width, fingers spread, wrists under the shoulders.",
      "Body in one straight line from head to heels (or knees): squeeze the glutes, ribs down.",
    ],
    cues: [
      "Lower as one piece, elbows angled about 45 degrees from the body.",
      "Chest goes towards the floor first, not the chin or the hips.",
      "Push the floor away to straight arms, spreading the shoulder blades at the top.",
      "Exhale on the way up.",
    ],
    mistakes: [
      "Hips sagging or piking up.",
      "Elbows flared straight out to the sides.",
      "Cutting the range short at the bottom.",
      "Doming or bulging down the middle of the stomach: go back a step if you see it.",
    ],
  },
  {
    variants: {
      "Wall one arm pushup": "One-arm push-up against a wall. Learn the shape here before going lower.",
      "Incline one arm pushup": "Hand on a bench or step. Lower the surface over time.",
      "Straddle one arm pushups": "Feet very wide on the floor for a big stable base.",
      "Half one arm pushup": "Full one-arm position, lowering only halfway.",
      "One arm pushups": "The full one-arm push-up on the floor.",
      "Decline one arm pushup": "Feet raised. The hardest version.",
    },
    setup: [
      "Feet wider than for a normal push-up. The wider, the easier.",
      "Working hand under the chest (slightly towards the middle), other hand behind the back or on the hip.",
      "Body straight and slightly turned, with the shoulders square to the floor as much as you can.",
    ],
    cues: [
      "Squeeze everything: glutes, stomach and the free side's lats.",
      "Lower slowly, keeping the elbow close to the body.",
      "Resist the twist: the hips and shoulders stay level.",
      "Press up through the whole hand.",
    ],
    mistakes: [
      "Twisting open so it becomes a side plank.",
      "Hips sagging.",
      "Feet too close together before you're strong enough.",
    ],
  },

  // ======================================================================
  // Pike push-ups and handstands
  // ======================================================================
  {
    variants: {
      "Incline pike pushup": "Hands on a bench, hips high. The easiest overhead push.",
      "Incline pike diamond pushup": "Incline pike with the hands together in a diamond.",
      "Pike pushup": "Hands on the floor, hips high so the body makes an upside-down V.",
      "Pike pushup diamond": "Floor pike with a diamond hand position.",
      "Decline pike pushups": "Feet on a bench, hips stacked high over the hands. Closer to a handstand push-up.",
      "Decline pike diamond pushup": "Decline pike with a diamond hand position.",
      "Decline pike pushup shoulder taps": "Hold the decline pike, lifting one hand at a time to tap the opposite shoulder.",
    },
    setup: [
      "Hands about shoulder width, walk the feet in until the hips are high over the shoulders.",
      "Arms straight, head between the arms, looking back towards the feet.",
    ],
    cues: [
      "Lower the top of the head towards the floor in front of the hands, making a triangle with head and hands.",
      "Elbows track back, not flared out.",
      "Press back up and push the shoulders up towards the ears at the top.",
    ],
    mistakes: [
      "Hips dropping so it turns into a normal push-up.",
      "Head landing between the hands instead of in front.",
      "Elbows flaring out wide.",
    ],
  },
  {
    variants: {
      "Wall assisted head stand": "Headstand against a wall for support.",
      "Free head stand": "Headstand away from the wall, balancing on head and hands.",
      "Shoulder-stand headstand": "A move from shoulder stand into a headstand, for control.",
    },
    setup: [
      "Make a triangle: hands shoulder width, head in front of them (top of the head, slightly forward of the crown).",
      "Use a mat or folded towel under the head.",
      "Walk the feet in until the hips stack over the shoulders.",
    ],
    cues: [
      "Press the hands into the floor so most of the weight is in the hands, not the neck.",
      "Lift one knee at a time onto the elbows (tuck), then slowly straighten the legs.",
      "Squeeze the glutes and legs together once vertical.",
      "To come down, tuck the knees and lower with control.",
    ],
    mistakes: [
      "All the weight on the head and neck.",
      "Kicking up hard instead of tucking up.",
      "Over-arching the back once up.",
    ],
  },
  {
    variants: {
      "Handstand hold": "Hold a wall handstand, chest facing the wall if you can.",
      "Handstand shrugs": "In a wall handstand, shrug the shoulders up to the ears and back down without bending the arms.",
      "Handstand balance left to right shuffle": "Shift the weight from hand to hand in a wall handstand.",
      "Handstand stomach to wall straddle hold": "Stomach facing the wall, legs open into a straddle.",
      "Handstand stomach to wall straddle shoulder taps": "Stomach to the wall in a straddle, lifting one hand at a time to tap the shoulder.",
      "Switch, back to the wall shoulder taps": "Back to the wall, lifting one hand at a time.",
      "Uneven handstand": "Wall handstand with one hand raised on a block. Do both sides.",
      "Lever handstand": "Wall handstand with one arm reaching out to the side as a lever. Do both sides.",
    },
    setup: [
      "Warm up the wrists first: circles and rocking forward over the hands.",
      "Hands shoulder width, about a hand's length from the wall, fingers spread.",
      "Chest to wall: walk the feet up the wall and the hands in. Back to wall: kick up gently.",
    ],
    cues: [
      "Push the floor away so the shoulders reach towards the ears.",
      "Ribs in, glutes squeezed, body in a straight line rather than a banana.",
      "Grip the floor with the fingers to steer your balance.",
      "Breathe. Come down before your form goes.",
    ],
    mistakes: [
      "Sinking into the shoulders.",
      "Big arch in the lower back.",
      "Hands too far from the wall.",
    ],
  },
  {
    variants: {
      "Half handstand pushup": "Wall handstand, lowering only halfway.",
      "Handstand pushup": "Wall handstand, lowering until the head lightly touches the floor (use a cushion).",
      "Wall handstand diamond pushup": "Hands close together in a diamond. Much harder on the triceps.",
      "One arm half handstand pushup": "Advanced. Mostly on one arm with the other lightly assisting. Partial range.",
      "One arm handstand pushup": "Elite level. Only attempt with excellent wall handstand control.",
    },
    setup: [
      "Kick up into a wall handstand, hands a little wider than shoulders and a hand's length from the wall.",
      "Put a folded mat where the head will land.",
    ],
    cues: [
      "Lower slowly with the elbows tracking forward rather than flaring out.",
      "Head goes slightly in front of the hands, making a triangle.",
      "Press back to straight arms and push tall through the shoulders.",
      "Keep the glutes tight so the back doesn't arch as you push.",
    ],
    mistakes: [
      "Dropping fast onto the head.",
      "Elbows flaring wide.",
      "Kicking the legs to get up.",
    ],
  },

  // ======================================================================
  // Dips
  // ======================================================================
  {
    variants: {
      "Bench dips, knees bent": "Hands on a bench behind you, feet flat with knees bent. The easiest dip.",
      "Bench dips, legs straight": "Legs straight out with the heels on the floor.",
      "Foot-elevated bench dips": "Heels on a second bench or chair so more weight goes through the arms.",
    },
    setup: [
      "Sit on the edge of a bench, hands beside the hips with fingers pointing forward.",
      "Slide the bum off the bench with the arms straight.",
    ],
    cues: [
      "Lower by bending the elbows straight back (not out), keeping the back close to the bench.",
      "Stop at about 90 degrees at the elbow, or sooner if the front of the shoulder complains.",
      "Press up to straight arms, keeping the shoulders down away from the ears.",
    ],
    mistakes: [
      "Dropping too deep, which strains the front of the shoulders.",
      "Shoulders rolling forward and up.",
      "Drifting away from the bench.",
    ],
  },
  {
    variants: {
      "Between-chairs dips, assisted": "Hands on two sturdy chairs, feet on the floor to help as much as needed.",
      "Parallel bar support hold": "Just hold the top position on straight arms.",
      "Parallel bar dips, band assisted": "Band looped over the bars and under the knees or feet to take some weight.",
      "Parallel bar negative dips": "Jump or step to the top, then lower over 3 to 5 seconds.",
      "Parallel bar dips, full": "Full dip on parallel bars.",
      "Wide grip dips": "Bars wider than shoulder width. Lean forward a little more for chest.",
      "Weighted dips": "Add weight with a dip belt or backpack once 3 sets of 12 or more are easy.",
      "Ring support hold": "Hold the top position on rings, arms straight and turned slightly out. The rings will shake: fight to keep them still.",
      "Ring dips, assisted": "Feet on the floor or a band helping. Keep the rings close to the body.",
      "Ring dips, full": "Full dip on rings. Turn the rings out at the top.",
      "Bulgarian dips": "Ring dips with the rings moving wide away from the body on the way down.",
      "Straight bar dips": "Dip on a single straight bar in front of the body, leaning forward over it.",
      "Russian dips": "Lower onto the forearms at the bottom of the dip, then push back up.",
      "Korean dips": "Bar behind the body, hands behind you. Advanced shoulder mobility needed.",
    },
    setup: [
      "Grip the bars (or rings) and press up to straight arms, shoulders pushed down away from the ears.",
      "Legs together or knees bent behind you, body slightly leaning forward.",
    ],
    cues: [
      "Lower with control until the shoulders are just below the elbows.",
      "Elbows point back, not flared out.",
      "Press back up to fully straight arms and push the shoulders down.",
    ],
    mistakes: [
      "Shrugging, so the shoulders sink to the ears.",
      "Bouncing out of the bottom.",
      "Going deeper than your shoulders are happy with.",
    ],
  },

  // ======================================================================
  // Rows and front lever
  // ======================================================================
  {
    variants: {
      "Vertical pulls": "Stand facing a sturdy upright (door frame or pole), hold it, lean back on straight arms and pull your chest to it.",
      "Wall pullups": "Facing a sturdy upright with the feet close to its base, lean back and pull yourself in. The further the lean, the harder.",
      "Horizontal pulls, legs bent": "Lie under a sturdy table or low bar, knees bent, and pull your chest up to it.",
      "Horizontal pulls": "Under a table or low bar with the legs straight.",
      "Inverted rows, legs bent": "Under a bar or rings at waist height, knees bent and feet flat.",
      "Inverted rows, legs straight": "Legs straight with the heels on the floor.",
      "Inverted rows, one leg extended": "One leg straight in the air. Swap legs each set.",
      "Inverted rows, legs elevated": "Feet on a bench so the body is horizontal or lower.",
      "Inverted rows, legs elevated one leg extended": "Feet up, then one leg lifted off the bench.",
      "Seated band row": "Sit with legs out, band round the feet, and row the handles to the stomach.",
      "Ring row, almost standing": "Rings at chest height, feet close to the anchor so you're nearly upright.",
      "Ring row, body at 45 degrees": "Walk the feet forward until the body is about 45 degrees.",
      "Ring row, body at 30 degrees": "Feet further forward, body at about 30 degrees to the floor.",
      "Ring row, rings at hip height, knees bent": "Rings lowered to hip height, knees bent with the feet flat.",
      "Ring row, rings at hip height, legs straight": "Rings at hip height, legs straight with the heels down.",
      "Ring row, feet on bench": "Feet raised on a bench, the hardest ring row.",
    },
    setup: [
      "Body rigid like a plank: glutes and stomach tight, ribs down.",
      "Start with straight arms and the shoulders set back, not hanging forward.",
    ],
    cues: [
      "Pull the elbows back past the body, aiming the handles (or bar) at the lower ribs.",
      "Squeeze the shoulder blades together and pause for a second at the top.",
      "Lower slowly all the way to straight arms.",
      "Exhale as you pull.",
    ],
    mistakes: [
      "Hips sagging so only the chest moves.",
      "Shrugging the shoulders up to the ears.",
      "Half reps that never reach straight arms.",
    ],
  },
  {
    variants: {
      "Tuck knees front lever rows": "Hang, then row with the body horizontal and knees tucked to the chest.",
      "Flat back front lever": "Tucked front lever hold with the back flat and horizontal (advanced tuck).",
      "One tuck knee one leg extended rows": "Front lever row with one knee tucked and the other leg straight.",
      "Straddle legs front rows": "Front lever row with the legs straight and wide apart.",
      "Front lever rows": "Rows from a full front lever with the legs together.",
      "Front lever pulls": "Pull from a dead hang up into a front lever position.",
      "Horizontal front lever pull-up to rings": "From a front lever, pull the rings to the body while staying horizontal.",
      "Ice cream maker": "From a pull-up at the top, swing the body out into a front lever and back.",
      "One-arm front lever": "Elite level. A front lever held on one arm.",
    },
    setup: [
      "Hang from a bar or rings, hands shoulder width.",
      "Pull the shoulders down and back so the arms stay straight and locked.",
    ],
    cues: [
      "Think about pushing the bar down towards your hips with straight arms.",
      "Tuck the pelvis under and squeeze the stomach to keep the body flat.",
      "Keep the body horizontal. Don't let the hips drop below the shoulders.",
      "Build up with short holds and stop before you lose the shape.",
    ],
    mistakes: [
      "Bending the arms.",
      "Hips sagging into a pike.",
      "Holding the breath for long holds.",
    ],
  },
  {
    variants: {
      "Back lever": "Hanging face down with the body horizontal, arms straight behind you. Build it with a tucked version first.",
    },
    setup: [
      "From a hang, tuck the knees and rotate backwards through the arms (skin the cat).",
      "Lower slowly until the body is horizontal and face down.",
    ],
    cues: [
      "Arms stay straight and the shoulders press down.",
      "Glutes squeezed so the hips don't pike.",
      "Start tucked, then straddle, then legs together as you get stronger.",
    ],
    mistakes: [
      "Going too deep into the shoulder stretch before the shoulders are ready.",
      "Bent arms.",
    ],
  },

  // ======================================================================
  // Pull-ups and hangs
  // ======================================================================
  {
    variants: {
      "Dead hang": "Hang on straight arms. Build grip and shoulder tolerance.",
      "Supported hang, feet on bench": "Hang with the feet resting on a bench so you take only part of your weight. Let go if the hands or wrists ache.",
      "Scapular pull-ups": "From a hang, pull the shoulders down without bending the arms, then relax back up.",
      "Kneeling band lat pulldown": "Band over the pull-up bar, kneeling underneath. Pull the elbows down to the ribs.",
      "Chin over the bar hold": "Jump or step up so the chin is over the bar, then hold.",
      "Flexed-arm hang": "Step up from a bench to chin over the bar and hold.",
      "Bent arm 90 degree hold": "Hold halfway up, elbows at 90 degrees.",
      "Negative chinup": "Palms facing you. Start at the top and lower over 3 to 5 seconds.",
      "Negative pullup": "Palms facing away. Step or jump up to the top and lower over 3 to 5 seconds.",
      "Jacknife pullup, box assisted": "Feet on a box in front of you with the legs straight, helping as much as needed.",
      "Assisted pullup, leg or bands": "Help from a band (looped under the knee or foot) or one foot on a step.",
      "Band-assisted pull-up, heavy band": "Thicker band under the knee or foot for more help.",
      "Band-assisted pull-up, light band": "Thinner band for less help.",
      "Half pullup": "Upper half only: from elbows at 90 degrees to chin over the bar.",
      "Pull up": "Full pull-up from a dead hang to chin over the bar.",
      "Close grip pullup": "Hands close together.",
      "Wide grip pullup": "Hands well outside the shoulders.",
      "Uneven pullup": "One hand on the bar, the other holding a towel or lower grip. Do both sides.",
      "Assisted one arm pullup": "One hand on the bar, the other holding a towel or band lower down to help.",
      "Assisted one arm pullup negative": "Lower on one arm, with the other hand lightly assisting.",
      "Half one arm pullup": "Upper half of a one-arm pull-up.",
      "One arm pullup": "Elite level. The full one-arm pull-up.",
    },
    setup: [
      "Grip the bar about shoulder width (or as the version says), thumbs round the bar.",
      "Hang with straight arms, then set the shoulders: pull them slightly down away from the ears.",
      "Legs together and slightly in front, glutes and stomach tight so you don't swing.",
    ],
    cues: [
      "Pull the elbows down towards the ribs, as if bending the bar.",
      "Chest up towards the bar. Chin over at the top.",
      "Lower all the way to straight arms under control.",
      "Exhale as you pull up.",
    ],
    mistakes: [
      "Kicking or swinging to get up.",
      "Half reps that never reach straight arms.",
      "Craning the neck to get the chin over.",
      "Dropping fast on the way down.",
    ],
  },

  // ======================================================================
  // Squats
  // ======================================================================
  {
    variants: {
      "Shoulderstand squat": "Lie on the back, legs up and hands supporting the hips, then bend the knees to the forehead and straighten. Teaches the squat pattern without load.",
      "Supported squat": "Hold a door frame, table or rack in front to help on the way up.",
      "Half squat": "Squat to about halfway (thighs at 45 degrees) and stand.",
      "Full squat": "Full depth: hips below the knees, heels down.",
      "Close squat": "Feet together. Harder on balance and ankles.",
      "Sit-to-stand from bench": "Stand up from a bench without rocking, sit down slowly.",
      "Box squat to bench, slow lower": "3 seconds down, a light touch on the bench, then stand.",
      "Bodyweight squat to bench height": "Tap the bench and go. Don't sit down.",
      "Bodyweight squat, full comfortable depth": "Only as deep as the back stays neutral and the heels stay down.",
      "Tempo squat, 3s down, 1s pause": "3 seconds down, pause 1 second at the bottom, then stand.",
      "Goblet squat, light dumbbell": "A light dumbbell held upright against the chest.",
      "Goblet squat, moderate dumbbell": "Heavier dumbbell at the chest. Elbows point down between the knees.",
      "Goblet squat, heavier dumbbell": "Heavier again. Keep adding small jumps when you hit the top of the range.",
    },
    setup: [
      "Feet about shoulder width, toes turned out slightly.",
      "Stand tall, ribs stacked over the pelvis.",
    ],
    cues: [
      "Sit back and down between the heels, knees following the toes.",
      "Keep the whole foot planted and the chest tall.",
      "Exhale as you stand, pushing the floor away.",
      "Squeeze the glutes at the top.",
    ],
    mistakes: [
      "Knees caving inwards.",
      "Heels lifting.",
      "Rounding the lower back at the bottom.",
    ],
  },
  {
    variants: {
      "Bulgarian split squats": "Back foot on a bench behind you, front foot far enough forward that the knee stays over the foot.",
      "Rear-foot-elevated split squat, holding the rack": "Back foot on the bench, one hand on the rack for balance.",
      "Rear-foot-elevated split squat with dumbbells": "Back foot on the bench, a dumbbell in each hand.",
      "Split squat holding the rack, short range": "Long stance, torso tall, lower a few inches and stand.",
      "Split squat holding the rack, full range": "Lower until the back knee nearly touches the floor.",
      "Split squat, no support": "No hand support, so balance is part of the work.",
      "Dumbbell split squat": "A dumbbell in each hand.",
      "Step-up onto low step": "Whole front foot on the step, push through it to stand up, step down slowly.",
      "Reverse lunge": "Step back into the lunge, then push through the front foot to return.",
    },
    setup: [
      "Long stance, front foot flat, back foot on its toes (or on the bench).",
      "Hips square to the front, torso tall.",
    ],
    cues: [
      "Drop straight down, back knee towards the floor.",
      "Front knee tracks over the toes. It can go forward a bit.",
      "Push through the whole front foot to come up.",
      "Exhale on the way up. Do all reps one side, then switch.",
    ],
    mistakes: [
      "Front heel lifting.",
      "Front knee caving in.",
      "Stance too short, so it's all knee and no glute.",
    ],
  },
  {
    variants: {
      "Box squat": "Single-leg squat down to a box or bench, the other leg held out in front.",
      "Single leg box squat, down from behind": "Stand on the box with one leg, lowering the other foot behind and down to tap the floor.",
      "Box squat hanging on a side": "Stand on the edge of a box with the free leg hanging off the side, and squat on the standing leg.",
      "Uneven squat": "One foot raised on a block or ball so that leg does most of the work. Do both sides.",
      "Half one legged squat": "Single-leg squat to about halfway.",
      "Assisted one legged squat": "Hold a door frame or rack to help on the way up.",
      "Balance assisted one legged squats": "Light fingertip support just for balance.",
      "Weighted one leg squat": "Holding a small weight in front helps balance the full pistol.",
      "Pistol squat": "Full single-leg squat with the other leg straight out in front.",
      "Renegade pistols": "Pistol, then jump and switch legs at the top. Advanced.",
    },
    setup: [
      "Stand on one leg, the other lifted in front (or as the version says).",
      "Arms reach forward for balance.",
    ],
    cues: [
      "Sit the hips back and down, knee tracking over the toes.",
      "Keep the standing heel flat.",
      "Lower slowly. Don't drop into the bottom.",
      "Drive up through the whole foot.",
    ],
    mistakes: [
      "Knee caving in.",
      "Heel lifting.",
      "Collapsing at the bottom and bouncing out.",
    ],
  },
  {
    variants: {
      "Beginner shrimp squat": "Hold the back foot behind you and lower the knee to a cushion, with hands on a support if needed.",
      "Intermediate shrimp squat": "No hand support. Back knee to the floor.",
      "Advanced shrimp squat": "Back knee touches down without the toes landing first.",
      "Elevated shrimp squat": "Standing on a step so you can go deeper.",
    },
    setup: [
      "Stand on one leg, bend the other knee and hold that foot behind you (or let it hang).",
    ],
    cues: [
      "Lean the chest forward a little to balance.",
      "Lower the back knee straight down towards the floor.",
      "Push through the standing foot to rise.",
    ],
    mistakes: [
      "Falling forward off the toes.",
      "Dropping onto the knee.",
    ],
  },

  // ======================================================================
  // Leg raises and hanging core
  // ======================================================================
  {
    variants: {
      "Knee tucks": "Sitting on the floor leaning back on the hands, draw the knees to the chest and extend.",
      "Flat knee raises": "Lying on the back, bring the knees from the floor to over the hips.",
      "Flat bent leg raises": "Lying down, legs bent at about 90 degrees, lower and raise.",
      "Flat frog raises": "Lying down, knees bent and turned out, raise to vertical and straighten.",
      "Flat straight leg raises": "Lying down, legs straight together, raise to vertical and lower.",
    },
    setup: [
      "Lie on the back with the hands flat under or beside the hips.",
      "Press the low back gently into the floor.",
    ],
    cues: [
      "Exhale and lift using the stomach, not a swing.",
      "Lower slowly, only as far as the low back stays on the floor.",
      "Curl the hips slightly off the floor at the top.",
    ],
    mistakes: [
      "Low back arching off the floor.",
      "Using momentum.",
    ],
  },
  {
    variants: {
      "Forearm straight leg raises": "Supported on the forearms in a dip station (captain's chair), legs straight.",
      "Hanging bent knee raises": "Hang from a bar and lift the knees to the chest.",
      "Hanging frog raises": "Hanging, knees out like a frog, raise them up.",
      "Hanging straight leg raises": "Hanging, lift straight legs to horizontal.",
      "Hanging bent leg V raises": "Bent legs lifted higher, to the chest.",
      "Hanging straight leg V raises": "Straight legs lifted past horizontal towards the bar.",
      "Hanging toes to bar": "Lift straight legs all the way to touch the bar.",
      "Hanging V raise windshield wipers": "With the legs raised up near the bar, rotate them side to side under control.",
      "One arm hanging knee raises": "Hang from one hand and raise the knees. Do both sides.",
    },
    setup: [
      "Hang with straight arms, shoulders pulled slightly down.",
      "Legs still before the first rep.",
    ],
    cues: [
      "Tilt the pelvis up as you lift, so the stomach does the work rather than the hip flexors.",
      "Lift with control, no swinging.",
      "Lower slowly to a still hang before the next rep.",
      "Exhale as you lift.",
    ],
    mistakes: [
      "Swinging back and forth.",
      "Arching the back to get the legs up.",
      "Letting go of the shoulder position.",
    ],
  },

  // ======================================================================
  // Bridges
  // ======================================================================
  {
    variants: {
      "Short bridges": "Lying on the back, knees bent, lift the hips (a glute bridge).",
      "Straight bridges": "Sitting with straight legs, hands beside the hips, lift into a straight line (reverse table).",
      "Angled bridges": "Hands on a raised surface (a bed or bench) while you push into a bridge.",
      "Head bridges": "Back bridge supported on the top of the head and the hands. Build up carefully.",
      "Half bridges": "Bridge over a ball or cushion so you only go partway.",
      "Full bridges": "Full wheel: hands and feet on the floor, arms straight, hips high.",
      "Wall walking down": "Back to a wall, reach overhead and walk the hands down the wall into a bridge.",
      "Wall walking up": "Walk the hands back up the wall out of the bridge.",
      "Closing bridge": "From standing, arch back into a full bridge without a wall.",
      "Stand to stand bridge": "From standing into a full bridge and back up to standing.",
    },
    setup: [
      "Warm up the spine and shoulders first: cat-cow and arm circles.",
      "Hands by the ears with fingers pointing towards the feet (for full bridges).",
    ],
    cues: [
      "Push through hands and feet to lift the hips high.",
      "Straighten the arms and push the chest towards the wall behind you.",
      "Squeeze the glutes to protect the lower back.",
      "Move slowly. Breathe through it.",
    ],
    mistakes: [
      "Bending only at the lower back.",
      "Elbows flaring out.",
      "Rushing the advanced versions before the earlier ones are solid.",
    ],
  },

  // ======================================================================
  // Bodyline holds and planks
  // ======================================================================
  {
    variants: {
      "Hollow hold": "Lying on the back, lift the shoulders and straight legs off the floor into a banana shape.",
      "Hollow hold, knees bent": "Only once the physio is happy with the abdominal gap. Knees bent, low back flat.",
    },
    setup: [
      "Lie on the back, arms overhead or by the sides.",
      "Press the low back into the floor before lifting anything.",
    ],
    cues: [
      "Lift the shoulder blades and legs slightly off the floor.",
      "Low back stays glued down. Bend the knees or raise the legs higher if it lifts.",
      "Ribs down, breathe steadily.",
    ],
    mistakes: [
      "Low back arching off the floor.",
      "Pulling on the neck with the chin.",
      "Doming down the middle of the stomach.",
    ],
  },
  {
    variants: {
      "Arch hold": "Lying face down, lift the arms, chest and legs off the floor (superman).",
      "Reverse plank": "Sitting with the legs straight, hands behind the hips, lift into a straight line facing up.",
    },
    setup: [
      "Get into position on a mat.",
    ],
    cues: [
      "Squeeze the glutes and the back of the legs.",
      "Keep the neck long, eyes on the floor (arch) or ceiling (reverse plank).",
      "Breathe steadily through the hold.",
    ],
    mistakes: [
      "Cranking the neck back.",
      "Hips sagging in the reverse plank.",
    ],
  },
  {
    variants: {
      "Plank": "Forearm plank on the toes.",
      "Incline forearm plank on bench": "Forearms on a bench, the easiest plank.",
      "Forearm plank from knees": "Forearms on the floor, knees down, straight line from knees to head.",
      "Forearm plank from toes": "Full forearm plank on the toes.",
      "Forearm plank, slow alternating leg lifts": "In a toes plank, lift one foot an inch at a time without the hips moving.",
    },
    setup: [
      "Elbows under the shoulders, forearms parallel.",
      "Body in one straight line, feet hip width.",
    ],
    cues: [
      "Squeeze the glutes and tuck the pelvis slightly.",
      "Ribs down, push the floor away so the upper back doesn't sag.",
      "Breathe steadily. Don't hold the breath.",
    ],
    mistakes: [
      "Hips sagging or piking up.",
      "Head dropping.",
      "Doming down the middle of the stomach: go back a step if you see it.",
    ],
  },
  {
    variants: {
      "Side plank": "On one forearm, feet stacked, hips lifted. Do both sides.",
      "Side plank from knees, on forearm": "Knees bent and down, hips pushed forward.",
      "Side plank from feet, on forearm": "Legs straight, feet stacked or staggered.",
      "Side plank from feet, top leg lifted": "Full side plank with the top leg raised.",
    },
    setup: [
      "Elbow directly under the shoulder.",
      "Body in a straight line from head to feet (or knees).",
    ],
    cues: [
      "Lift the hips and push them slightly forward.",
      "Push the floor away with the forearm so you don't sink into the shoulder.",
      "Breathe steadily. Hold each side the same time.",
    ],
    mistakes: [
      "Hips sagging or sticking back.",
      "Rolling forward or back.",
    ],
  },
  {
    variants: {
      "Single-arm dumbbell row, light": "A light dumbbell. Reps are each side.",
      "Single-arm dumbbell row, moderate": "A heavier dumbbell. Reps are each side.",
    },
    setup: [
      "One hand and the same-side knee on the bench, other foot on the floor.",
      "Back flat and roughly parallel to the floor, dumbbell hanging under the shoulder.",
    ],
    cues: [
      "Row the dumbbell towards the hip, elbow close to the body.",
      "Squeeze the shoulder blade back at the top.",
      "Lower slowly to a full stretch.",
      "Keep the hips and shoulders square. Don't twist to lift.",
    ],
    mistakes: [
      "Twisting the torso open.",
      "Shrugging the weight up.",
    ],
  },
  {
    variants: {
      "Band pull-apart": "Hold a band at chest height with straight arms and pull it apart.",
    },
    setup: [
      "Hands shoulder width on the band, arms straight in front at chest height.",
    ],
    cues: [
      "Pull the band apart until it touches the chest, arms staying straight.",
      "Squeeze the shoulder blades together, shoulders down.",
      "Return slowly. Don't let the band snap back.",
    ],
    mistakes: [
      "Shrugging.",
      "Bending the elbows.",
      "Arching the back.",
    ],
  },

  // ======================================================================
  // Core (postpartum friendly)
  // ======================================================================
  {
    variants: {
      "Heel slides": "Lying on the back, knees bent, slide one heel away along the floor and back. Reps are each side.",
      "Tabletop toe taps": "Knees over hips at 90 degrees, lower one foot to tap the floor and return.",
      "Dead bug, arms only": "Legs held in tabletop while the arms reach overhead in turn.",
      "Dead bug, legs only": "Arms still, lower one foot at a time.",
      "Dead bug, opposite arm and leg": "Reach one arm overhead and straighten the opposite leg together.",
      "Dead bug, opposite arm and leg, leg straighter": "Same as above, with the leg extending lower and straighter.",
      "Dead bug with band pull-down": "Band anchored overhead, held pulled to the hips while the legs move.",
    },
    setup: [
      "Lie on the back, knees bent (or in tabletop), arms up towards the ceiling.",
      "Breathe into the ribs, then exhale and gently draw the lower belly in and lift the pelvic floor.",
    ],
    cues: [
      "Exhale as the arm or leg moves away, inhale as it comes back.",
      "Low back stays gently on the floor throughout.",
      "Slow and controlled. Ribs stay down.",
    ],
    mistakes: [
      "Low back arching off the floor.",
      "Holding the breath.",
      "Doming, bulging or pressure down below: go back a step and tell your physio.",
    ],
  },
  {
    variants: {
      "Bird dog": "On hands and knees, reach one arm forward and the opposite leg back. Reps are each side.",
      "Half-kneeling Pallof press": "Half kneeling side-on to a band anchored at chest height, press the band straight out and back.",
      "Standing Pallof press": "Standing side-on to the anchor, feet hip width.",
    },
    setup: [
      "Get set with the spine neutral and the stomach gently braced.",
    ],
    cues: [
      "Resist the twist: the hips and shoulders stay square.",
      "Move slowly and pause for a second at the end of each rep.",
      "Exhale as you reach or press.",
    ],
    mistakes: [
      "Rotating towards the band, or tipping the hips in bird dog.",
      "Arching the low back.",
      "Rushing.",
    ],
  },

  // ======================================================================
  // Glutes and hinge
  // ======================================================================
  {
    variants: {
      "Glute bridge": "Lying on the back, knees bent, feet flat, lift the hips.",
      "Glute bridge, 3s squeeze at top": "Hold and squeeze for 3 seconds at the top of every rep.",
      "Banded glute bridge": "Band just above the knees. Push the knees gently out against it.",
      "Single-leg glute bridge": "One foot down, the other leg lifted. Reps are each side.",
      "Hip thrust, shoulders on bench": "Upper back on a bench just below the shoulder blades.",
      "Banded hip thrust": "Hip thrust with a band just above the knees.",
      "Dumbbell hip thrust": "A dumbbell resting on the hips, padded with a towel.",
      "Barbell hip thrust": "Bar padded across the hips. Start with the empty bar.",
    },
    setup: [
      "Feet flat, hip width, close enough that the shins are vertical at the top.",
      "Chin slightly tucked, eyes forward rather than up at the ceiling.",
    ],
    cues: [
      "Exhale and drive through the heels to lift the hips.",
      "Squeeze the glutes hard at the top, ribs down.",
      "Finish with a straight line from knees to shoulders. Don't arch past it.",
      "Lower under control.",
    ],
    mistakes: [
      "Arching the lower back to get higher.",
      "Pushing through the toes.",
      "Knees falling in.",
    ],
  },
  {
    variants: {
      "Hip hinge with broomstick": "A stick along the back touching the head, upper back and tailbone the whole time.",
      "Band good morning": "Band under the feet and behind the neck. Hinge, then drive the hips forward.",
      "Dumbbell Romanian deadlift, light": "Light dumbbells sliding down the front of the thighs.",
      "Dumbbell Romanian deadlift, moderate": "Heavier dumbbells, same pattern.",
      "Supported single-leg Romanian deadlift": "One hand on the rack for balance. Reps are each side.",
      "Single-leg Romanian deadlift with dumbbell": "A dumbbell in the opposite hand to the standing leg. Reps are each side.",
    },
    setup: [
      "Feet hip width, soft knees.",
      "Stand tall with the back flat and shoulders back.",
    ],
    cues: [
      "Push the hips back, as if closing a car door with your bum.",
      "Weights (or hands) slide down close to the legs.",
      "Stop when you feel a stretch in the hamstrings or the back starts to round.",
      "Exhale and drive the hips forward to stand tall, squeezing the glutes.",
    ],
    mistakes: [
      "Rounding the back to reach lower.",
      "Bending the knees so it turns into a squat.",
      "Leaning back at the top.",
    ],
  },

  // ======================================================================
  // Pressing (dumbbells and bands)
  // ======================================================================
  {
    variants: {
      "Seated band overhead press": "Band under the bench or feet, palms facing each other.",
      "Seated dumbbell press, neutral grip": "Sitting tall on the bench, palms facing each other.",
      "Standing dumbbell press, neutral grip": "Standing, glutes squeezed so the low back doesn't arch.",
      "Half-kneeling single-arm dumbbell press": "Half kneeling, pressing with the arm on the same side as the down knee. Reps are each side.",
      "Standing dumbbell press, heavier": "Heavier dumbbells, same form.",
    },
    setup: [
      "Weights (or band handles) at shoulder height, palms facing in, elbows in front of the body.",
      "Ribs down, stomach gently braced.",
    ],
    cues: [
      "Exhale and press straight up until the arms are by the ears.",
      "Keep the ribs down. Don't lean back.",
      "Lower slowly back to the shoulders.",
    ],
    mistakes: [
      "Arching the lower back to finish the press.",
      "Shrugging the shoulders up.",
      "Pressing out in front instead of overhead.",
    ],
  },
  {
    variants: {
      "Dumbbell floor press, light, neutral grip": "Lying on the mat with knees bent, palms facing in.",
      "Dumbbell floor press, moderate": "Heavier dumbbells on the floor.",
      "Dumbbell bench press, neutral grip": "On the bench, feet flat, palms facing in.",
      "Dumbbell bench press, heavier": "Heavier dumbbells on the bench.",
    },
    setup: [
      "Dumbbells over the chest, arms straight, palms facing each other.",
      "Shoulder blades gently squeezed back into the floor or bench.",
    ],
    cues: [
      "Lower slowly, elbows about 45 degrees from the body.",
      "On the floor, pause when the upper arms touch down.",
      "Exhale and press back up over the chest.",
    ],
    mistakes: [
      "Elbows flared straight out.",
      "Dropping the weights fast.",
      "Arching the back off the bench.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** Loose key: case, punctuation, "push-up"/"pushup" and plurals don't matter. */
export function guideKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\b(push|pull|chin|sit)[\s-]+ups?\b/g, "$1up")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

const INDEX = new Map();
FAMILIES.forEach((family) => {
  Object.entries(family.variants).forEach(([name, focus]) => {
    INDEX.set(guideKey(name), { focus, setup: family.setup, cues: family.cues, mistakes: family.mistakes });
  });
});

/** `{ focus, setup, cues, mistakes }` for an exercise name, or null. */
export function guideFor(name) {
  return INDEX.get(guideKey(name)) ?? null;
}
