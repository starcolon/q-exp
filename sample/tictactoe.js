"use strict";

/**
 * Tic-Tac-Toe strategy learning sample
 */

var colors = require('colors');
var prompt = require('prompt');
var _      = require('underscore');
var ql     = require('../main.js');
var State  = require('../state.js');
var fs     = require('fs');

ql.isVerbose = true; // Make sure it's gonna go verbose

var isVsHuman = process.argv.splice(2).indexOf('play')>=0;

/*-----------------
 * c00 | c10 | c20
 *-----------------
 * c01 | c11 | c21
 *-----------------
 * c02 | c12 | c22
 *-----------------
*/

var actionSet = [
	'c00','c10','c20',
	'c01','c11','c21',
	'c02','c12','c22'
];

var ttt = {}
var b1 = '⎈';
var b2 = '⌘';

ttt.agentVsHuman = function agentVsHuman(){
	var alpha;
	// Initialise bot & human handler
	var bot = ql.newAgent('tictactoe-1',actionSet,alpha=0.44)
		.then(ql.bindRewardMeasure( rewardOf(b1) ))
		.then(ql.bindActionCostMeasure( costOfAct ))
		.then(ql.bindStateGenerator( takeMove(b1) ))
		.then(ql.bindStatePrinter( statePrint(b1,b2) ))
		.then(ql.load('./agent'));

	var board = boardToState(emptyBoard(),b1);

	// Bot starts the game
	bot.then(ql.start(board))
		.then(humanTake); // Human takes the next turn
}

ttt.agentVsAgent = function agentVsAgent(){
	var alpha;
	// Initialise bots
	var bot1 = ql.newAgent('tictactoe-1',actionSet,alpha=0.35)
		.then(ql.bindRewardMeasure( rewardOf(b1) ))
		.then(ql.bindActionCostMeasure( costOfAct ))
		.then(ql.bindStateGenerator( takeMove(b1) ))
		.then(ql.bindStatePrinter( statePrint(b1,b2) ))
		.then(ql.load('./agent'));

	var bot2 = ql.newAgent('tictactoe-2',actionSet,alpha=0.35)
		.then(ql.bindRewardMeasure( rewardOf(b2) ))
		.then(ql.bindActionCostMeasure( costOfAct ))
		.then(ql.bindStateGenerator( takeMove(b2) ))
		.then(ql.bindStatePrinter( statePrint(b2,b1) ))
		.then(ql.load('./agent'));

	var board = boardToState(emptyBoard(),b1);

	// Start the game
	Promise.all([bot1,bot2])
		.then(function(bots){
			let bot1 = bots[0];
			let bot2 = bots[1];

			// Bot1 makes the first move of the game
			Promise.resolve(bot1)
				.then(ql.start(board))
				.then((_bot1) => {
					// Bot2 takes the next move
					handoverTo(_bot1,bot2)
				})
				.catch((e) => {
					console.error('FATAL '.red + e);
					console.error(e.stack);
				})
		})
}

function humanTake(bot){
	// Human takes the next move
	console.log('HUMAN takes a move'.magenta);
	var state = flipSide(bot.state);
	var board = stateToBoard(state,b2,b1);

	// Print the board
	board.map((row,j) => {
		console.log('   ' + row.map((c,i) => 
			c == 0 ? `[ ${i}${j}]`.white :
			c == b1 ? '[ ' + c.red + ' ]' :
			'[ ' + c.green + ' ]'
		).join('-'))
	})

	prompt.start();
	prompt.get(['move'], (err,res) => {
		console.log('You picked: '.yellow + res['move']);

		// Apply an action
		var action = 'c' + res['move'];
		var state_ = takeMove(b1)(state,action);

		// Switch over to bot
		botTake(bot,state_);
	})
}

function botTake(bot,state){
	console.log('Bot takes a move'.magenta);

	// Get the current state
	var state_ = flipSide(state);
	bot = ql.setState(state_)(bot);	
	var reward = rewardOf(b1)(state_);

	console.log('Bot perceives a state reward of : '.cyan + reward);

	// Conclude the game
	function conclude(reward){
		if (Math.abs(reward)>=100 || isEnd){
			// The game has ended
			if (reward>=100){
				console.log('¬¬¬¬¬¬ BOT WON! ¬¬¬¬¬¬ '.red)
			}
			else if (reward<=-100){
				console.log('¬¬¬¬¬¬ YOU WON! ¬¬¬¬¬¬ '.green)	
			}
			else{
				console.log('¬¬¬¬¬¬ DRAW! ¬¬¬¬¬¬ '.cyan)
			}
		}

		return Promise.reject('Game Ended');
	}

	// Check if the game has ended
	var isEnd = !isAvailableToMove(state_) || Math.abs(reward)>=100;

	Promise.resolve(bot)
		.then(function(_bot) {
			// If the game is over, skips
			// Otherwise, the bot makes a move
			return isEnd ? conclude(reward) : ql.step(_bot)
		})
		.then((_bot) => {

			var reward = rewardOf(b1)(_bot.state);

			// Game has ended?
			if (Math.abs(reward)>=100) conclude(reward);
			else if (!isAvailableToMove(_bot.state)) conclude(reward);
			else humanTake(_bot);  // Handover to human
		})
		.catch((e) => {
			if (e!='Game Ended'){
				console.error('FATAL '.red + e);
				console.error(e);
			}
		})
}

/**
 * Turn handover between bots
 */
function handoverTo(from,to){
	console.log(to.name.green + ' now takes turn'.magenta);

	// Get the current state
	var state = flipSide(from.state);
	var me = ql.setState(state)(to);	
	var reward = rewardOf(b1)(state);

	console.log(to.name.green + ' perceives a state reward of : '.cyan + reward);

	// Check if the game has ended
	var isEnd = !isAvailableToMove(state);

	if (Math.abs(reward)>=100 || isEnd){
		// A winner has been decided!
		if (me.name=='tictactoe-1'){
			if (reward >= 100) console.log('TICTACTOE-1 WON!'.green);
			else if (reward <= -100) console.log('TICTACTOE-1 LOST!'.red);
			else console.log('TICTACTOE-1 DREW'.silver);

			// Learn from its recent move
			Promise.resolve(me)
				.then(ql.learn)
				.then(ql.save('./agent'))
				.then(ql.saveAs('./agent/tictactoe-2'))
		}
		else{
			// Skip this turn, and handover to the bot1
			console.log('skips the turn'.magenta)
			var opponent = from;
			Promise.resolve(me)
				.then((myself) => handoverTo(myself,opponent)) 
		}
	}
	else{
		// Still in the game, just learn
		// and move on
		if (me.name=='tictactoe-1'){
			var opponent = from;
			Promise.resolve(me)
				.then(ql.learn)
				.then(ql.step)
				.then((myself) => handoverTo(myself,opponent)) 
				.catch((e) => {
					console.error('BOT1 ERROR '.red + e);
					console.error(e.stack)
				})
		}
		else{
			// Me takes the current state from opponent
			// makes a new move
			// then handover the turns
			var opponent = from;
			Promise.resolve(me)
				.then(ql.step)
				.then((myself) => handoverTo(myself,opponent))
				.catch((e) => {
					console.error('BOT2 ERROR '.red + e);
					console.error(e.stack)
				})
		}
	}
}

function flipSide(state){
	var sides = state.hash.split(':');
	return new State([sides[1] + ':' + sides[0]])
}

function rewardOf(piece){
	return function(state){
		var mystate = state.hash.split(':')[0];
		var theirstate = state.hash.split(':')[1];

		if (mystate.length==0) return 0;
		
		// Measure the score based on how close we win
		// or lose
		var score = 0;
		winningPatterns().forEach((pattern) => {

			// Skip if winner has been decided
			if (Math.abs(score)>=100) return;

			let agg = 0;
			pattern.forEach((act) => {
				if (mystate.indexOf(act)>=0) agg++;
				if (theirstate.indexOf(act)>=0) agg--;
			})
			
			// Win?
			if (agg==3) score = 100;
			// Almost win?
			else if (agg==2) score += 30;
			// Lost?
			if (agg==-3) score = -100;
			// Almost lost?
			else if (agg==-2) score -= 30;
		})

		return score;
	}
}


function costOfAct(state,action){
	// Invalid moves result minus value
	if (state.hash.indexOf(action)>=0) return -Infinity;

	// Otherwise, we blindly guess the cost
	return Math.random()*10;
}


function emptyBoard(){
	return [[0,0,0],[0,0,0],[0,0,0]];
}

function transpose(board){
	var t = board.map((row,i) => 
		row.map((c,j) => board[j][i])
	)
	return t;
}

function takeMove(piece){
	return function(state,action){
		// Convert the state back to a board
		var board = stateToBoard(state,piece,'X');
		// Take a move!
		var move = actionToMove(action);

		board[move[1]][move[0]] = piece;

		// Convert the board back to the state and return
		return boardToState(board,piece);
	}
}


function actionToMove(a){

	var m = a.match(/c*(\d)(\d)/);
	return [m[1],m[2]];
}


// Convert a board to a state string
// based on the perspective of a player
function boardToState(board,piece){
	var a = [];
	var b = [];

	board.forEach(function(row,j){
		row.forEach(function(c,i){
			if (c==piece) a.push(`c${i}${j}`);
			else if (c!=0) b.push(`c${i}${j}`);
		})
	})

	var s = a.join(',') + ':' + b.join(',');
	return new State([s]);
}


// Convert a state string back to a board
function stateToBoard(state,piece,theirPiece){
	var players = state.hash.split(':');
	var board = emptyBoard();

	var represent = [piece,theirPiece];

	players.forEach((p,n) => {
		if (p.length==0) return; // No move representation

		p.split(',').forEach((action) => {
			var move = actionToMove(action);
			var i = move[0];
			var j = move[1];
			board[j][i] = represent[n];
		})
	})

	return board;
}


function statePrint(piece,theirPiece){
	return function(state){
		var board = stateToBoard(state,piece,theirPiece);
		board.forEach((row) => {
			var r = row.map((u) => 
				u==piece ? u.green : 
				u==theirPiece ? u.red :
				'0'
			);
			console.log('   [' + r.join('-') + ']');
		})
	}
}


function winningPatterns(){
	return [
		['c00','c11','c22'], // diagonal
		['c20','c11','c02'], // diagonal
		['c00','c10','c20'], // first row
		['c01','c11','c21'], // second row
		['c02','c12','c22'], // third row
		['c00','c01','c02'], // first column
		['c10','c11','c12'], // second column
		['c20','c21','c22']  // third column
	];
}


function isAvailableToMove(state){
	var validMoves = _.reject(state.hash.split(/,|:/),_.isEmpty);
	var numMoves   = validMoves.length;
	return numMoves < 9;
}



// Start
isVsHuman ? ttt.agentVsHuman() : ttt.agentVsAgent();
