"use strict";
/**
 * Falling stones bot using RL with generalisation
 * @author StarColon Projects
 */

var colors = require('colors');
var prompt = require('prompt');
var _      = require('underscore');
var ql     = require('../main.js');
var State  = require('../state.js');
var fs     = require('fs');

ql.isVerbose = true; // Make sure it's gonna go verbose

var alpha;

const actionSet = [ // Character movement
	'←','→','#' 
];

const BOARD_SIZE = 7;
const MAX_LESSONS = 40;

/* 5x5          0
	┏━━━━━┓
	┃ ⦷      ┃ 1
	┃    ⦷   ┃ 2
	┃        ┃ 3
	┃     😎 ┃ 4*
  ┗━━━━━┛
   1  2  3  4 5   
*/


function initState(){
	var myPos = (BOARD_SIZE-1)/2+1;
	var ball1 = [0,0];
	var ball2 = [2,0];

	return new State([myPos].concat(ball1).concat(ball2));
}

/**
 * Perceived total reward of a state
 */
function Q(state){
	// Dies = -1
	// Almost get hit = 0
	// Still alive = 3
	const SCORE_DIE = -1;
	const SCORE_CLOSE_CALL = 0;
	const SCORE_ALIVE = 3;

	var myPos = state.state[0];
	var ball1 = state.state.slice(1,3);
	var ball2 = state.state.slice(3,5);

	if ((myPos==ball1[0] && ball1[1]==BOARD_SIZE-1) ||
		(myPos==ball2[0] && ball2[1]==BOARD_SIZE-1))
		return SCORE_DIE;
	if ((myPos==ball1[0] && ball1[1]==BOARD_SIZE-2) ||
		(myPos==ball2[0] && ball2[1]==BOARD_SIZE-2))
		return SCORE_CLOSE_CALL;
	else
		return SCORE_ALIVE;
}

function actionCost(state,a){
	var state_ = nextState(state,a);
	return Q(state_)
}

function nextState(state,a){
	// Move
	var myPos = state.state[0];
	if (a=='←'){ // Move left
		myPos--;
		if (myPos < 0) myPos = 0;
	}
	else if (a=='→'){ // Move right
		myPos++;
		if (myPos > 5) myPos = 5;
	}
	// Otherwise, it stays its position

	// Stones fall down
	var ball1 = state.state.slice(1,3);
	var ball2 = state.state.slice(3,5);

	ball1[1]++;
	ball2[1]++;

	// If the ball hits into the ground,
	// reset the position
	if (ball1[1]>BOARD_SIZE){
		// Randomly pick where to drop the ball on the top
		ball1 = [parseInt(Math.random()*BOARD_SIZE),0]
	}
	if (ball2[1]>BOARD_SIZE){
		ball2 = [parseInt(Math.random()*BOARD_SIZE),0]	
	}

	// Return the next state
	return new State([myPos].concat(ball1).concat(ball2));
}

function render(state){
	// Do nothing
	var myPos = state.state[0];
	var ball1 = state.state.slice(1,3);
	var ball2 = state.state.slice(3,5);

	// Render the frame
	var horz = '';
	horz = (new Array(BOARD_SIZE*3)).fill('━'.cyan).join('')
	console.log(horz);
	for (var j=0; j<BOARD_SIZE; j++){
		horz = ''+j;
		for (var i=0; i<BOARD_SIZE; i++){
			if (ball1[0]==i && ball1[1]==j)
				horz += ' ⦷ '.red;
			else if (ball2[0]==i && ball2[1]==j)
				horz += ' ⦷ '.blue;
			else if (myPos==i && j==BOARD_SIZE-1)
				horz += ' 😎 ';
			else
				horz += ' – ';
		}
		console.log(horz);
	}
	horz = (new Array(BOARD_SIZE*3)).fill('━'.cyan).join('')
	console.log(horz);
}

function countMove(agent){
	if (!agent.move) agent.move = 1;
	agent.move++;
	return agent;
}

function repeatMove(agent,nLessons,history){
	// Generate next move
	agent
		.then(ql.perceiveState)
		.then(ql.step)
		.then(ql.perceiveState)
		.then(ql.learn)
		.then(countMove)
		.then(function(_agent){
			// Over?
			var _state = _agent.state;
			var _score = Q(_state);
			if (_score<0){
				console.log('❌❌❌ GAME OVER ❌❌❌');
				nLessons++;

				history.push(_agent.move);

				if (nLessons<MAX_LESSONS){
					// Start the next lesson
					console.log('========================='.green)
					console.log(`   LESSON #${nLessons} begins`)
					console.log('========================='.green)

					// Reset move before startover
					_agent.move = 0;

					var bot = Promise.resolve(_agent)
								.then(ql.start(initState()));
					return repeatMove(bot,nLessons,history)
				}
				else{
					// Conclude the learned policy
					console.log("");
					console.log(`  ${Object.keys(_agent.policy).length} policies learned`);
					console.log("");
					console.log('  [Num moves until it dies]');
					console.log('  ',history)

					// If haven't generalised, do it and 
					// startover the lesson
					if (_agent.ϴ){
						// Conclude
						var historyBeforeGenl = history.slice(0,MAX_LESSONS);
						var historyAfterGenl = history.slice(MAX_LESSONS);

						console.log('=============================='.cyan)
						console.log(' Before generalisation:'.cyan);
						console.log(historyBeforeGenl.join(','));
						console.log('');
						console.log(' After generalisation:'.cyan);
						console.log(historyAfterGenl.join(','));
						return _agent;
					}
					else return generalize(_agent,history);
				}
			}
			else{
				// Generate the next step
				return repeatMove(Promise.resolve(_agent),nLessons,history)
			}
		})
}

function generalize(agent,history0){
	console.log('======= GENERALISING THE MODEL ======'.magenta);
	// Generalise the model
	ql.generalize('GD')(agent)
	// Then start over the game
		.then(function startOver(_agent){
			console.log('========== RESTARTING THE GAME ======'.magenta);
			let agent = Promise.resolve(_agent)
				.then(ql.start(initState()));
			return repeatMove(agent,0,history0)
		})
}

var bot = ql.newAgent('bot',actionSet,alpha=0.22)
	.then(ql.bindRewardMeasure(Q))
	.then(ql.bindActionCostMeasure(actionCost))
	.then(ql.bindStateGenerator(nextState))
	.then(ql.bindStatePrinter(render));

var board = initState();
var nLessons = 0;
var total = 0; // Total score
var score = 0; // Recent score

console.log('Initial location: '.green);
render(board);

// keep playing until the bot dies over and over

// Lesson time! // Repeat until over
bot = bot.then(ql.start(board));
repeatMove(bot,nLessons,[])






