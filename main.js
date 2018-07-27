"use strict";

/**
 * Simple Q-learning library for JavaScript ninja
 * @author StarColon Projects
 */

var ql          = {}
var fs          = require('fs');
var Promise     = require('bluebird');
var _           = require('underscore');
var colors      = require('colors');
var State       = require('./state.js');
var Generalizer = require('./generaliz.js');
var config      = require('./package.json');

ql.isVerbose = true;
Promise.longStackTraces = true;

/**
 * Create a new agent with given predefined actionset
 * @param {String} name of the agent file to save or load
 * @param {Array} list of actions (string)
 * @param {Number} learning rate
 */
ql.newAgent = function(name,actionset,alpha){
	var agent = {}
	agent.name = name;
	agent.actionset = actionset;
	agent.func = {};
	agent.policy = {};
	agent.alpha = alpha || 0.5;
	agent.history = [];
	return Promise.resolve(agent)
}

// stateGenerator takes a state and an action
// to create a new subsequent state
ql.bindStateGenerator = function(stateGenerator){
	return function(agent){
		agent.func.stateGenerator = stateGenerator;
		return agent;
	}
}

ql.bindRewardMeasure = function(rewardOfState){
	return function (agent){
		agent.func.rewardOfState = rewardOfState;
		return agent;
	}
}

ql.bindActionCostMeasure = function(actionCost){
	return function(agent){
		agent.func.actionCost = actionCost;
		return agent;
	}
}

ql.bindStatePrinter = function(p){
	return function(agent){
		agent.func.statePrint = p;
		return agent;
	}
}


ql.clearHistory = function(agent){
	agent.history.length = 0;
	return Promise.resolve(agent);
}

/**
 * Save the learned policy to a physical file
 *  the name of the agent is used as the file name
 */
ql.save = function(path){
	return function(agent){
		fs.writeFileSync(`${path}/${agent.name}.agent`,JSON.stringify(agent.policy));
		return Promise.resolve(agent).error((e) => {
			console.error('Unable to save agent state'.red);
			console.error(e);
		});
	}
}

/**
 * As the learned policy as a specified file
 */
ql.saveAs = function(fullpath){
	return function(agent){
		fs.writeFileSync(`${fullpath}.agent`,JSON.stringify(agent.policy));
		return Promise.resolve(agent);
	}
}

/** 
 * Load the policy from a physical file
 */
ql.load = function(path){
	return function(agent){
		return new Promise((done,reject) => {
			fs.readFile(`${path}/${agent.name}.agent`,function(err,policy){
				if (err) {
					console.error('Unable to load agent'.red);
					console.error(err);
					return done(agent);
				}

				policy = JSON.parse(policy);
				agent.policy = policy;

				ql.isVerbose && console.log('AGENT LOADED'.cyan);
				ql.isVerbose && console.log(agent.policy)

				done(agent)
			})
		})
	}
}

/**
 * Illustrate the policy it learned
 */
ql.revealBrain = function(agent){
	if (Object.keys(agent.policy).length==0)
		return agent;

	console.log('[BRAIN SCAN]'.green)
	Object.keys(agent.policy).forEach(function(state){
		console.log(state);
		console.log(`   most probable action: ${agent.policy[state][0].action} (${agent.policy[state][0].reward})`)
	})
	return agent;
}

/**
 * Update the policy from the observation
 * @param {State} state
 * @param {String} action
 * @param {Number} reward value to add
 */
ql.__updatePolicy = function(state,action,rewardAddUp){
	return function(agent){
		// Register a new state if haven't
		if (!agent.policy.hasOwnProperty(state.hash)){
			agent.policy[state.hash] = {}
			agent.policy[state.hash] = agent.actionset.map(function(a){
				return {action: a, reward: a==action ? rewardAddUp : 0}
			})
		}
		else{
			// State exists, update the action reward
			agent.policy[state.hash] = agent.policy[state.hash].map(function(a){
				if (a.action==action) 
					return {action: action, reward: rewardAddUp};
				else return {action:a.action, reward: a.reward}
			})
		}

		// Resort the policy (higher reward comes first)
		agent.policy[state.hash] = _.sortBy(agent.policy[state.hash],(s)=>-s.reward);
		return Promise.resolve(agent)
	}
}



/**
 * Explore the reward of the next state after applying an action
 * @param {State} current state
 */
ql.__rewardOf = function(state){

	return function(agent){
		return agent.func['rewardOfState'](state.hash);
	}
}


/**
 * Determine (predict) the reward we would get 
 * when perform a particular action on a state 
 */
ql.__q = function(state,action){
	
	return function(agent){
		var cost = agent.func.actionCost(state,action);
		if (cost<0)
			return cost;

		// Do we have the state and action registered in the policy?
		if (agent.policy.hasOwnProperty(state.hash)){
			// Yes, we have the state memorised
			var _act = (agent.policy[state.hash].filter((a) => a.action==action));
			if (_act.length==0)
				return agent.funcactionCost(state,a);
			else
				return _act[0].reward;
		}
		else{

			// Estimate cost from generalised model
			if (agent.ϴ){
				console.log('Recall policy from generalisation'.cyan);

				var actionIndex = agent.actionset.indexOf(action);
				var _state = [1].concat(state.state)
				var _cost  = agent.ϴ[actionIndex].reduce((_c,θi,i) =>
					_c + θi*_state[i]
					,0)
				return _cost;
			}

			// We don't know anything about the current state
			// Guess it based on uniform distribution then
			return cost;
		}
	}
}


/**
 * Explore the subsequent states by trying some actions on it
 */
ql.__exploreNext = function(state){
	return function(agent){
		// List all actions and try
		var rewards = agent.actionset.map(function(a){
			// Predict the reward we would get
			var q = ql.__q(state,a)(agent);
			
			// If the predicted reward remains zero,
			// apply some uncertainty noise
			if (q==0) q += Math.random();

			return {action: a, reward: q}
		})

		// Sort the actions by rewards (higher first)
		return _.sortBy(rewards,(r) => -r.reward);
	}
}

/**
 * Start a new learning course of the agent
 * @param {State} initial state
 */
ql.start = function(initState){
	return function(agent){
		ql.isVerbose && console.log('Starting...'.cyan);

		// Clear the history then start
		return ql.clearHistory(agent)
			.then(ql.setState(initState))
			.then(ql.step);
	}
}


/**
 * Perceive and store its own state in the history tree
 */
ql.perceiveState = function(agent){
	agent.history.push({action: null, state: agent.state});
	return agent;
}

/**
 * Set the current state
 */
ql.setState = function(state){
	return function(agent){
		agent.state = state;
		// Push the state to the history list too
		agent.history.push({action: null, state: state})
		return agent;
	}
}


ql.getState = function(agent){
	return agent.state
}


/**
 * Learn from the recent step which introduces a new state
 * This should be called after `ql.step`
 * and then `ql.setState` strictly
 */
ql.learn = function(agent){

	// NOTE:
	// Last history       = perceived environmental state after a move
	// Preceeding of last = A move the agent took

	// History primary validations
	if (agent.history.length<2){
		return Promise.reject('Agent has not yet made any steps.');
	}

	var L = agent.history.length;
	var lastMove     = agent.history[L-2];
	var currentState = agent.history[L-1];

	if (currentState.action!=null){
		return Promise.reject('Agent needs to update the current state after a move.');
	}

	if (lastMove.action == null){
		return Promise.reject('Agent should perceive the current state after its recent move.')
	}

	var reward0 = agent.func.rewardOfState(lastMove.state);
	var reward1 = agent.func.rewardOfState(currentState.state);
	var delta   = agent.alpha * (reward1 - reward0);

	// Learn from mistake, update the policy
	ql.isVerbose && console.log(agent.name + ' learning new policy ...'.cyan + delta.toFixed(2));
	ql.__updatePolicy(lastMove.state, lastMove.action, delta)(agent);

	return agent;
}


/**
 * Let the agent choose the next best action
 */
ql.step = function(agent){

	ql.isVerbose && console.log('STEP BEGINS'.green);

	if (!agent.state){
		return Promise.reject('Assign the current state first with `ql.setState`');
	}

	// Explore the next states
	var nexts = ql.__exploreNext(agent.state)(agent);

	ql.isVerbose && console.log('generated actions:'.yellow);
	ql.isVerbose && console.log(nexts);
	
	// Greedily pick the best action
	var chosen = nexts[0];
	var currentReward = agent.func.rewardOfState(agent.state);

	// Register the chosen action
	agent.history.push({action: chosen.action, state: agent.state});

	ql.isVerbose && console.log(agent.name + ' chose action :'.green + chosen.action);

	// Generate the state after an action is taken
	agent.state = agent.func.stateGenerator(agent.state, chosen.action);

	// Print the state
	ql.isVerbose && agent.func.statePrint && agent.func.statePrint(agent.state);

	return agent;
}


/**
 * Generalise the J* space
 * based on the learned state-reward terrain
 * @param {String} method of generalisation to exploit
 */
ql.generalize = function(method){
	
	const maxIters = 100;
	const alpha = 0.0001; // Keep it tiny for finest adjustment
	method = method || 'GD'; // Gradient descent by default

	return function(agent){
		// Prepare mapping #action --> #reward 
		var Qa = agent.actionset.map(function(a){
			return {states:[], rewards:[]}
		});

		// Step through policy and collect
		// rewards of each action
		Object.keys(agent.policy).forEach((hash) => {
			var state  = State.fromHash(hash);
			// Iterate through each action and fill the space
			agent.policy[hash].forEach((a,i) => {
				// `a` = {action: .... , reward: .....}
				Qa[i].states.push(state);
				Qa[i].rewards.push(a.reward);
			})
		})

		// By each action space, fit the parameterised ϴ 
		var ϴspace = []
		Qa.forEach((action,i) => {
			var states = action.states;
			var rewards = action.rewards;

			var ϴi = Generalizer.fit(states,rewards,maxIters,alpha,method);

			ϴspace[i] = ϴi;
		})

		// Now we have learned the entire J* space
		// Let the agent memorised it for use
		agent.ϴ = ϴspace;
		return Promise.resolve(agent)
	}
}



module.exports = ql;