// Avoiding EMCAScript6 syntatic sugar for the sake of backwards compatibility

/*
 */
 
 function PrefVoteVizControl ( options, $target ) {
 
 	// defaults
 	this.running = false;
 	this.viewClass = 'PrefVoteVizBaseView';
 	this.$target = $target;
 	this.imageDir = false;
 	let source = false;
 	let data = false;
 	
 	for ( optionName in options ) {
 		switch(optionName) {
 			case 'running':
 			case 'viewClass':
 			case 'imageDir':
 				this[optionName] = options[optionName];
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
 	
 	// Get data if needed
 	if ( source && !data ) {
 		data = this._loadData(source);
 	}
 	this._setupData( data );
 	
 	let thisViewClass = window[ this.viewClass ];
 	console.log( thisViewClass );
 	this.view = new thisViewClass ( 
 		this._getData(), 
 		{ 'imageDir' : this.imageDir },
 		this.$target
 	);
 	 
 	this._setupHTML();
 	
 	// And then setup targets
 	
 	this.view.show();
 	
}
 
PrefVoteVizControl.prototype._loadData = function(sourceURL) {
	let that = this;

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

            })
            .fail(function(e){console.log('failed log', e)});
            return json;
     })();
     
     if ( data.status == 'success' ) {
	     return data.data;
	 } else {
	 	return false;
	 }
}

PrefVoteVizControl.prototype._setupData = function( data ) {
	// legacy formats
	this.constituency = {
		quota : parseInt(data.constituency.Quota || data.constituency.quota ),
		seats : parseInt(data.constituency.seats || data.constituency.Number_Of_Seats ),
		turnout :  data.constituency.turnout || data.constituency.Total_Poll
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
    for (var k=0; k<this.counts;k++){
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
/*
                <div id="stageNumbers"></div>
                <div id="controls">
                    <a href="#Again" id="again" class="fa fa-step-backward"></a>
                    <a href="#Pause" id="pause-replay" class="fa fa-play"></a>
                    <a href="#Next" id="step" class="fa fa-step-forward"></a>
                </div>
                <div id="quota"></div>
                <div id="animation"></div>
                <div id="donutAnimation"></div>
 */
	if ( !('$controls' in this) ) {
		if ( this.$target.find('.controls').length == 0 ) {
			this.$target.append('<div id="controls"><a href="#Again" class="again fa fa-step-backward"></a><a href="#Pause" class="pause-replay fa fa-play"></a><a href="#Next" class="step fa fa-step-forward"></a></div>'
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
		if ( !('$animation' in this) ) {
		if ( this.$target.find('.animation').length == 0 ) {
			this.$target.append('<div class="animation"></div>');
		}
		this.$animation = this.$target.find('.animation');
	} 
	
	// Populate Stage numbers
    this.$stageNumbers.html("");
    for (let i = 0; i < this.counts; i++) {
        this.$stageNumbers.append("<div class='stageNumber' data-stageNumber=" + (i) + "'><p>" + (i + 1) + "</p></div>");
    }
	
}


/* showing data: 
	
	
	$("#quota").text("Turnout: " + numberWithCommas(parseInt(this.constituency.turnout)) + " Quota: " + constituency.quota);
	$("#seats-span").text(constituency.seats);
*/