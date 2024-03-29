/*
Avoiding EMCAScript6 syntatic sugar for the sake of backwards compatibility

PrefVoteVizControl Interface has:
	* new ( data, options, $target ) //Is there any reason for separating visual initialisation to later? //show?()
	* show() //start showing 
	* showStep (i) // No more showFirstStep.
	* animateTransfer (i)
	* destroy()

 */

/* global $ */

function PrefVoteVizControl ( options, $target ) {

	// defaults
	this.running = false;
	this.loopID = false;
	this.animationTimeoutIDs = [];
	this.viewClass = "PrefVoteVizBaseView";
	this.$target = $target || $('#showPrefVoteViz');
	this.countNumber = 0; //was 1. Why?
	let source = false;
	let data = false;
    let viewOptions = {};

	for ( var optionName in options ) {
		switch(optionName) {
			case 'running':
			case 'viewClass':
				this[optionName] = options[optionName];
				break;
			case 'imageDir':
            case 'tick':
                viewOptions[optionName] = options[optionName];
                break;
			case 'data':
				data = options[optionName];
				break;
			case 'source':
				source = options[optionName];
				break;
			default:
				console.log('Unrecognised option ' + optionName + ' passed to PrefVoteVizControl');
		}
	}
	
	try {
		// Get data if needed
		if ( source && !data ) {
			data = this._loadData(source);
		}
		this._setupData( data );
        
		let thisViewClass = window[ this.viewClass ];
        let gottenData = this._getData();
		this.view = new thisViewClass ( 
			gottenData, 
            viewOptions,
			this.$target
		);
		
		this._setupHTML();

		// Fill control HTML
		this.$target.find("#quota").text("Turnout: " + Number.prototype.toLocaleString(parseInt(this.constituency.turnout)) + " Quota: " + this.constituency.quota);
		this.$target.find("#seats-span").text(this.constituency.seats);

		/* Failure should include:
			//if we didn't load a constituency var then we have no data yet
			$("#quota,.quota").text("There are no data up for this contest at present.");
			$("#stageNumbers").html("");
		*/

		// And then setup targets
		this._setupHandlers();
        
		this.view.show();
        
		if ( this.running ) {
			this.$target.find(".pause-replay").click();
		}
		this.status = 'success';
	} catch ( err ) {
		console.log(err);
		if ( 'message' in err ) {
			$target.text( 'Error: ' + err.message ) ;
		}
		this.status = 'error';
		this.error = err;
	}
}
 
PrefVoteVizControl.prototype._loadData = function(sourceURL) {
	// let that = this; //not needed

	// Assume that source is already pointed at the right place, avoiding Stages Translating proxy if needed.
/*
	if ( this.source.substr(0,4) === 'http' ) {
		jsonURL = './php/stagesTranslatingProxy.php?url=' + jsonURL;
	}
*/

	let data = (function() {
			var json = null;
			$.ajax({
				'async': false,
				'global': false,
				'url': sourceURL,
				'dataType': "json",
				'success': function (data) {
					json = data;
				},
				'fail' : function (e) {
					console.log('failed log', e);
					json = { 
				'status' : 'error', 'message' : 'Ajax failed. Web response ' + e.status, 'data' : e
					};
				}

			});
			return json;
	})();
	
	if ( data == false || data == null ) {
		throw { 'status': 'error', 'message' : 'No data returned' };
	} else if ( data.status == 'success' ) {
		return data.data;
	} else if ( 'candidatesDict' in data ) {
		return data;
	} else if ( 'message' in data ) {
		throw data ;
	} else {
			data.message = 'No message returned';
			throw data;
	}
}

PrefVoteVizControl.prototype._setupData = function( data ) {
	// legacy formats
    this.constituency = {
        quota : parseInt( ('Quota' in data.constituency) ? data.constituency.Quota : data.constituency.quota ),
        seats : parseInt( ('seats' in data.constituency) ? data.constituency.seats : data.constituency.Number_Of_Seats ),
        turnout :  ('turnout' in data.constituency) ? data.constituency.turnout : data.constituency.Total_Poll
    };
	// Electorate size, and hence turnout, not supported

	
	
	/**
	* The data forms dictionaries containing snippets of the following form
	* candidate data object of the form {
	*  id:String,     candidate's id in data
	*  name:String,   candidate's name
	*  status:String, is the candidate elected or excluded
	*  party:String   party string suitable to use as html/css class
	* }
	*
	* countData (by round and candidate) of the form {
	*  total:Number,      the total for a candidate at *the end* of a specfic round of the count
	*  status:String,     the status of the candidate at specfic round (Excluded, Elected, '')
	*  order:Number       a candidates order at a specfic round
	*  transfers:Boolean  does this candidate's vote transfer in this round?
	* 
	* Thus if a candidate is Elected, the sequence goes
	* - step before their election
	* - step when they pass quota (with "Elected" status)
	* - step when they transfer
	
	* This is the same step things are displayed for "view", but not for "Elected" status
	
	* transferDict (by round and candidate), being the delta of that rounds' transfers, ie 
	*   countData[round][candidate].total = countData[round-1][candidate].total + transferDict[round][candidate]
	* 
	
	* }
	**/
	
	this.candidatesDict = {}; //Dictionary of candidates {} id as key
	this.candidates = [];     //Array of candidates in order first seen in data
	this.countDict = {};      //Dictionary of counts, first level key is count number, which points to a dict of countData with key candidate id
	this.transferDict={};     //Corresponding dictionary of transfers indexed by [count number][candidate id]
	
	if ( Array.isArray( data.candidatesDict ) ) {
		this.candidatesDict = Object.assign( {}, data.candidatesDict ); //Force into object even if JSON passed it as a list-array.
		this.candidates = data.candidatesDict;
	} else {
		this.candidatesDict = data.candidatesDict; //Force into object even if JSON passed it as a list-array.
		this.candidates = data.candidatesDict.values();
	}
	this.countDict = data.countDict;
	this.transferDict = data.transferDict; // Derived, might move this back here?
	this.counts = data.constituency.counts ;

		//once we have all the data in the countDict we can now go through each count and order it
	//we do this in order as once a candidate is elected we store their final order in the candidatesDict and reuse it subsquent counts
	//only sorting candidates that are not eliminated or elected

	// This is only relied on by ordered views
	for (let k=0; k<this.counts;k++){
		if (this.countDict.hasOwnProperty(k)) {
			this._adjustOrder(this.countDict[k]);
		}
	}
}

// Return the data variable as a hash.
PrefVoteVizControl.prototype._getData = function() {
	return {
		// does not seem to need candidatesDict and count?
		constituency : this.constituency, //
		candidates: this.candidates, //
		countDict: this.countDict, //
		transferDict: this.transferDict, //as transfers
	};
}

PrefVoteVizControl.prototype._adjustOrder = function (singleCountDict){
	var copy=[];
	var start=0;

	for (var k in singleCountDict){
		if (singleCountDict.hasOwnProperty(k)) {
			var data = singleCountDict[k];
			// Add Elected to start
			if (data["status"] == "Elected" && this.candidatesDict[k]["status"]) {
				start++;
				data["order"] = this.candidatesDict[k]["order"];
			// Add excluded to end
			}else if (singleCountDict[k]["status"] == "Excluded" && this.candidatesDict[k]["status"]) {
				data["order"] = this.candidatesDict[k]["order"];
			// Add active to the main round
			}else{
				copy.push({
					key: k,
					count: data["total"]
				});
			}
		}
	}

	copy.sort(function (a, b) {
		if (a.count > b.count)
		return -1;
		if (a.count < b.count)
		return 1;
		// a must be equal to b
		return 0;
	});

	//candidatesDict is global and we use it here to store state of where those people we're not ordering are elected
	for(var i=0;i<copy.length;i++){
		singleCountDict[copy[i]["key"]].order = i+start;
		this.candidatesDict[copy[i]["key"]].order = i+start;
		if (singleCountDict[copy[i]["key"]]["status"] != "" ) {
			this.candidatesDict[copy[i]["key"]].status = singleCountDict[copy[i]["key"]]["status"];
		}
	}
}



PrefVoteVizControl.prototype._setupHTML = function () {
	if ( !('$controls' in this) ) {
		if ( this.$target.find('.controls').length == 0 ) {
			this.$target.append('<div id="controls" class="controls"><a class="again fa fa-step-backward"></a><a class="pause-replay fa fa-play"></a><a class="step fa fa-step-forward"></a></div>'
			);
		}
		this.$controls = this.$target.find('.controls');
	} 
	if ( !('$stageNumbers' in this) ) {
		if ( this.$target.find('.stageNumbers').length == 0 ) {
			this.$target.append('<div class="stageNumbers"></div>');
		}
		this.$stageNumbers = this.$target.find('.stageNumbers');
	} 
	if ( !('$quota' in this) ) {
		if ( this.$target.find('.quota').length == 0 ) {
			this.$target.append('<div class="quota"></div>');
		}
		this.$quota = this.$target.find('.quota');
	}
	/* Created by view
	if ( !('$animation' in this) ) {
		if ( this.$target.find('.animation').length == 0 ) {
			this.$target.append('<div class="animation"></div>');
		}
		this.$animation = this.$target.find('.animation');
	} */
	
	// Populate Stage numbers
	this.$stageNumbers.html("");
	for (let i = 0; i < this.counts; i++) {
		this.$stageNumbers.append('<div class="stageNumber" data-stageNumber="' + (i) + '" ><p>' + (i + 1) + "</p></div>");
	}
	
	this._setStageNumber1();

}

PrefVoteVizControl.prototype._setStageNumber1 = function() {
	this.$target.find(".stageNumber").removeClass("active completed").first().addClass('completed');
	this.$target.find(".controls").addClass("at-start");
}

PrefVoteVizControl.prototype._updateCounter = function() {
	// We don't know whether the current step is active, but we know the others are not.
	this.$target.find(".stageNumber").slice( this.countNumber+1 ).removeClass("completed");
	//$(".stageNumber").slice( this.countNumber ).removeClass("active");
	this.$target.find(".stageNumber").slice( 0, this.countNumber+1 ).addClass('completed');
	if ( this.countNumber == 0 ) {
		this.$target.find('.controls').removeClass('at-end').addClass('at-start');
	} else if ( this.countNumber >= this.counts - 1 ) {
		this.$target.find('.controls a.pause-replay').removeClass('fa-pause fa-play').addClass('fa-repeat');
		this.$target.find('.controls').removeClass('at-start').addClass('at-end');
	} else {
		this.$target.find('.controls').removeClass('at-start at-end');
	}
}

PrefVoteVizControl.prototype._setActiveMarker = function () {
	// It's always the *next* stage that's being animated
	// let that = this; //unused
	let $nextStepMarker = this.$target.find(".stageNumber").removeClass("active").eq(this.countNumber +1);
	$nextStepMarker.addClass('active');
	// As soon as a step is active, you're not at the start and can go backwards
	// (Partially because the first step is never active.)
	this.$target.find('.controls').removeClass('at-start');
	// Make it flash or otherwise appear active for 1000 ticks
	const thisTimeout = window.setTimeout( function() { 
		$nextStepMarker.removeClass("active").addClass("completed");
	}, this.view.tick * 1000 );
	this.animationTimeoutIDs.push( thisTimeout );
}

PrefVoteVizControl.prototype._setupHandlers = function () {
	let that = this;
	this.$target.find(".pause-replay").click(function(event) {
		event.preventDefault();
		if ($(this).hasClass("fa-pause")) {
			that._pause();
		} else if ($(this).hasClass("fa-play")) {
			$(this).removeClass("fa-play");
			$(this).addClass("fa-pause");
			that._resume();
		} else {
			$(this).removeClass("fa-replay").addClass("fa-pause");
			that._replay();
		}
	});    

	this.$target.find(".step").click(function(event) {
		event.preventDefault();
		that.step(); //step forward
	});

	this.$target.find(".again").click(function(event) {
		event.preventDefault();
		that.again();
	});

	this.$target.find(".stageNumber").click(function () {
		let i = parseInt($(this).data('stagenumber'));
		that.jumpToStep(i);
	})

    // TODO make optional, depending on whether anything else on the page needs a key capture
	$('body').keypress(function(event) {
		event.preventDefault();
		that.step();
	});
	
}


// firstCount folded into construction & _setStageNumber1

PrefVoteVizControl.prototype._advanceCount = async function() {
	// Do we have a step to which to advance?
	if ( this.countNumber+1  in this.countDict ) {
		//update the counters
		this._updateCounter();
		this._setActiveMarker();
		let animationPromise = this.view.animateTransfer( this.countNumber +1); //Transfer to next stage?
		this.countNumber ++; //wise when ending?
        return animationPromise;
	} else {
		// called when the loop hits the end
		this._pause(); //I think this should do everything
        return true;
	}
}

PrefVoteVizControl.prototype._playStep = async function() {
	if( this.countNumber in this.countDict ) {
		// stop any currently running animations
		//$(this.$target).stop(true,true) <- should go to bar chart resetForStep
		// Stop ongoing animations.
		this._resetAnimations();
		// If it goes back to the first step, there's nothing to play
		this.view.showStep( this.countNumber);
		return this._advanceCount();
	} else {
        return false; // will be turned into promise automatically
		// should not get here; set a breakpoint
	}
}

// Remember if the animation was playing before being frozen

PrefVoteVizControl.prototype._freezeLoop = function() {
	if ( this.loopID ) {
		this.isLoopFrozen = true;
		clearInterval( this.loopID );
		this.loopID = false;
	}
}

PrefVoteVizControl.prototype._thawLoop = function() {

	if ( this.isLoopFrozen ) {
		this.isLoopFrozen = false;
		this._startLoop(); 
	}
}

PrefVoteVizControl.prototype._resetAnimations = function() {

	this.animationTimeoutIDs.forEach( window.clearTimeout );
	this.$target.find(".stageNumber").removeClass('active');
	this.view.resetForStep();
}

PrefVoteVizControl.prototype._startLoop = function() {
	let that = this;
	this.loopID = window.setInterval( function() { that._advanceCount(); }, 2000*this.view.tick);
}

// autoplay only: stop
PrefVoteVizControl.prototype._pause = function() {
	let isAtEnd = this.countNumber >= this.countDict.length-1;
	let icon = isAtEnd?'fa-repeat':'fa-play';
	this.$target.find('.pause-replay')
		.removeClass("fa-pause")
		.addClass(icon);
	this.$target.find('.controls').toggleClass('at-end', isAtEnd );

	window.clearInterval( this.loopID );
	this.loopID = false;
	// Let existing animations run out - so don't remove the active marker
	// this.$target.find('.active').addClass('completed').removeClass('active');
	/*
	if ( this.countNumber >= this.counts-1 ) {
		debugger;
        this.$target.find(".pause-replay").removeClass("fa-pause").addClass("fa-repeat");
	}*/
}

// advance count & resume autoplay
PrefVoteVizControl.prototype._resume = async function() {
	let animationPromise = this._advanceCount();
	this._startLoop();
    return animationPromise;
}

// reset & start autoplay
PrefVoteVizControl.prototype._replay = function() {
	this.jumpToStep(0);
	this._startLoop();
}

// stop; play; start; adjust pause-replay button
PrefVoteVizControl.prototype.jumpToStep = function(stepIndex) {
	this._freezeLoop();
	this.countNumber = stepIndex;
	//this._playStep();
	this._resetAnimations();
	this.view.showStep(this.countNumber);
	this._updateCounter();
	this._thawLoop();
	let $pauseReplay = this.$target.find(".pause-replay");
	if ($pauseReplay.hasClass("fa-repeat")) {
		$pauseReplay.addClass("fa-play");
	}
}


// stop; play; start
PrefVoteVizControl.prototype.step = async function() {
	this._pause();
	return this._playStep();
}

// go backwards; restat loop if exists
PrefVoteVizControl.prototype.again = function() {
	this._pause();
	this.countNumber -= 2;
	if ( this.countNumber < 0) {
		this.countNumber = 0;
		this.view.showStep( this.countNumber );
		this._updateCounter();
	} else {
		this.view.showStep( this.countNumber );
		this._advanceCount();
	}
	let $pauseReplay = this.$target.find(".pause-replay");
	if ($pauseReplay.hasClass("fa-repeat")) {
		$pauseReplay.addClass("fa-play");
	}
}

/* Minor outstanding issues:
 * - sometimes, after ending paused, the play icon doesn't change to the repeat icon
 */

//So can be loaded as CommonJS for testing
if ( typeof(module) === 'object' ) {
    module.exports = PrefVoteVizControl ;
}