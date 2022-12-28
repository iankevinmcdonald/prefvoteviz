/* global d3,$,PrefVoteVizBaseView */
/* eslint no-debugger: "off" */

function PrefVoteVizDoughnut( data, options, $target ) {
	PrefVoteVizBaseView.call( this, data, options, $target );
	// radius by proportion of the different doughnuts
	this.INNER_BY_STATUS = {
		'transfer': 0.1,
		'count': 0.5,
		'elected': 0.8,
		'label': 1.01,
	};

	if ( this.$target.find('.donutAnimation').length == 0 ) {
		this.$target.append( '<div class="donutAnimation" id="donutAnimation" ></div>');
	}

	this._setup();
	this._initCountDict();

}

Object.setPrototypeOf( PrefVoteVizDoughnut.prototype, PrefVoteVizBaseView );

PrefVoteVizDoughnut.prototype._setup = function() {
    let $donutAnimation = this.$target.find('.donutAnimation');
	let widthPx = $donutAnimation.innerWidth();
	
	/*
		The labels add ~ 0.5r on either side and around 0.25r above and below.
		So the overall dimensions are slightly over 3r by 2.5r
		Exact numbers corrected with trial and error.
		*/
	this.radius = Math.min( widthPx / 3.1, (window.innerHeight-90) / 2.5 );
	let heightPx =  this.radius * 2.5;

	// create the base blank SVG object.
	this.svg = d3.select( $donutAnimation[0] )
		.append("svg")
		.attr("width", widthPx)
		.attr("height", heightPx )
		.append("g")
		.attr("transform", "translate(" + widthPx / 2 + "," + heightPx / 2 + ")");

	// We need to calculate all the arc positions in advance.
	/* Why? Because arcs, unlike bars, are not an SVG primitive, and so do not know their own polar
		co-ordinates. Thus they cannot pass their polar starting position to the transition() function.
		Thus we cannot do the round-by-round animation with dynamic data joining.
		Thus we calculate  everything at the start.
		*/
	this.ARCS = {};
	for ( var arcName in this.INNER_BY_STATUS ) {
		let innerRadius = this.INNER_BY_STATUS[ arcName ] * this.radius;
		
		let outerRadius = (arcName=='label')? innerRadius : this._outerFromInner( innerRadius );
		this.ARCS[ arcName ] = d3.arc().innerRadius( innerRadius ).outerRadius( outerRadius );
	}
	this.rFactor = 2 * Math.PI / this.data.constituency.turnout ;
	this.quotaAngle = 2*Math.PI/ ( this.data.constituency.seats + 1);

	// Firstly, the seats Each occupy 1/(seats+1) of the circle, offset by 1/( (seats+1) * seats * 2 )
	this.winnerBoxes = [];
	var boxOffset = Math.PI/( ( this.data.constituency.seats+1 ) * this.data.constituency.seats );

	//let innerRadius = this.radius * this.INNER_BY_STATUS.elected;
	// let outerRadius = this._outerFromInner( innerRadius);
	for( let i=0; i < this.data.constituency.seats ; i++ ) {
		let thisStartAngle = boxOffset * (i+1) + (this.quotaAngle+boxOffset) * i;
		this.winnerBoxes[ i]= {
			index: i,
			padAngle: 0,
			startAngle: thisStartAngle,
			endAngle: thisStartAngle + this.quotaAngle,
			xSign: ( thisStartAngle + this.quotaAngle/2 ) < Math.PI ? 1 : -1,
		}
	}

}

// was initFirstcount
PrefVoteVizDoughnut.prototype.show = function() {

	// Because candidate positions depend on other candidates, it's hard to deal with one in isolation.
	const that = this;

	
	this.svg
		.selectAll('matchesNothing')
		.data(this.winnerBoxes)
		.enter()
		.append('path')
		.attr('d', 
//				d3.arc().innerRadius( innerRadius ).outerRadius( outerRadius )
			this.ARCS.elected
		)
		.attr('class', 'seat vacant')
		.attr('data-arc', function(d){ return { startAngle: d.startAngle, angle: that.quotaAngle } ; } )
	;

	this.showStep(0);
	
}

PrefVoteVizDoughnut.prototype._initCountDict = function () {
	const that = this;
	// Get the candidate ID indices
	this.candidateOrder = [ ...Array(this.data.candidates.length).keys() ];
	
	// And then sort them according to candidate info: (Nb: earlier post-processing that attributes them to non-parties will take precedence... - so this effectively hasn't been tested)
	// So at the start, candidates[i].id = i, but re-ordering will break this assocation
	this.candidateOrder.sort( function(a,b) {
		if ( that.data.candidates[a].party != that.data.candidates[b].party && !(that.data.candidates[a].party.substr(0,4) == 'None' && that.data.candidates[b].party.substr(0,4) == 'None')) {
			let aParty = that.data.candidates[a].party.toLowerCase();
			let bParty = that.data.candidates[b].party.toLowerCase();
			if ( aParty < bParty ) {
				return -1;
			} else {
				return 1;
			}
			// Sorting by name
		} else {
			if ( that.data.candidates[a].name < that.data.candidates[b].name ) {
				return -1 ;
				// This shouldn't happen
			} else if ( that.data.candidates[a].name == that.data.candidates[b].name ) {
				return 0;
			} else {
				return 1;
			}
		}
	});
	
	// For every countDict, I need a spacing & a set of candidate arcs
	// Because they're in their own order, they also need to retain the candidate information.'
	// Reminder that these vote numbers are at *end* of round
	this.candidateArcs = {};
	this.electedCandidateArcs = {};
	
	// Current seats lag one round behind reserved seats
	let reservedSeats = new Array(this.winnerBoxes.length) ;
	let currentSeats = new Array(this.winnerBoxes.length) ;
	
	// The reserved seats have to be winners in final round, in that order.
	// candidates[i].status = their final status.
	this.electedCandidatesBySeat = 
		this.candidateOrder
		.map( function(candidateId) { return that.data.candidates[candidateId] ; })
		.filter( function(c) { return c.status == 'Elected' ; })
		.map( function(c) { return c.id ; });
	
	// Create all elected candidate arcs, so that the apt ones can be included in each step.
	// (Might not be needed ...)
	let allElectedCandidateArcs = [];
	for(let i =0; i< this.winnerBoxes.length ; i++ ) {
		let thisArc = Object.assign({}, this.winnerBoxes[i]);
		let thisCandidateId = this.electedCandidatesBySeat[ i];
		thisArc = Object.assign( thisArc, this.data.candidates[thisCandidateId] );
		this.data.candidates[thisCandidateId].seatIndex = i;
		allElectedCandidateArcs[i] = thisArc;
	}

		// isNewlyElected1 : passes quota this round, align with winning box
		// isNewlyElected2 : the round they rise to the winning box & transfer (thus feature in electedCandidatesBySeat);
		// - also the first round with the "Elected" status
		
	// there are also the "finally elected" that do not go through the pre-rotation
	
	// isNewlyElected make more sense to go through one candidate at a time.
	
	// blank all
	for( let countNumber in this.data.countDict ) {
		for ( let candidateId in this.data.countDict[countNumber] ) {
			this.data.countDict[countNumber][candidateId].isNewlyElected1 = false;
			this.data.countDict[countNumber][candidateId].isNewlyElected2 = false;
			this.data.countDict[countNumber][candidateId].isFinallyElected = false;
		}
	}
	
	// Fill in elected.
	for( let i=0; i < this.data.candidates.length; i++) {
		let thisCandidate = this.data.candidates[ this.candidateOrder[i] ];
		let countInWhichElected = null;
		if ( thisCandidate.status == 'Elected' ) {
			//which count are they elected in?
			for ( let countNumber in this.data.countDict ) {
				if ( this.data.countDict[countNumber][ thisCandidate.id ].status == 'Elected' ) {
					countInWhichElected = countNumber;
					break;
				}
			}
			
			if ( countInWhichElected != null ) {
				this.data.countDict[countInWhichElected-1][thisCandidate.id].isNewlyElected1 = true;
				this.data.countDict[countInWhichElected][thisCandidate.id].isNewlyElected2 = true;
			} else {
				this.data.countDict[ this.data.countDict.length-1 ][thisCandidate.id].isFinallyElected = true;
			}
		} 
	}

	
	for( let countNumber in this.data.countDict ) {
		this.candidateArcs[ countNumber ] = [];
		let votesOnCountRing = 0;
		let candidatesLeft = 0, candidatesElected = 0;
		
		let newlyElectedCandidateIDs = [ ];
		// First pass to work out the spacing and circle start
		for( let i=0; i < this.data.candidates.length; i++) {
			let thisCandidate = this.data.candidates[ this.candidateOrder[i] ];
			let totalVotes = this.data.countDict[countNumber][ thisCandidate.id ].total ;

			// CountDict, unlike the arcs, is indexed by candidateID.
			// Note that "isShown" means "on the main ring", so elected candidates are not shown
			
			if ( totalVotes <= 0 ) {
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
			// We include status = '', and the first two rounds with status = 'Elected'
			} else if ( this.data.countDict[countNumber][ thisCandidate.id ].status  == '' ) {
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = true;
			} else if ( this.data.countDict[countNumber][ thisCandidate.id ].status  == 'Excluded' ) {
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
			} else if ( this.data.countDict[countNumber][ thisCandidate.id ].status  == 'Elected' ) {
				// At newlyElected2 and on, appears in the winner circle
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
				candidatesElected ++;
			}
			
			//Push to array on isNewlyElected1
			if ( this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 ) {
				newlyElectedCandidateIDs.push( thisCandidate.id );
			}
			
			// How many votes divided between how many candidates on the ring?
			if ( this.data.countDict[countNumber][ thisCandidate.id ].isShown ) { 
				votesOnCountRing += parseFloat( this.data.countDict[countNumber][ thisCandidate.id ].total );
				candidatesLeft ++;
			} 
			
		}
		
		if (!candidatesLeft) {
			// Before lost of math errors happen
			break;
		}
		
		//Padding betweeen each remaining candidate
		let arcPadding = ( 2*Math.PI - this.rFactor * votesOnCountRing ) / ( candidatesLeft + candidatesElected )
		let currentStartAngle = arcPadding /2;

		for( let i=0; i < this.data.candidates.length; i++) {
			let thisCandidate = this.data.candidates[ this.candidateOrder[i] ];
			let totalVotes = this.data.countDict[countNumber][ thisCandidate.id ].total ;
			if (
				this.data.countDict[countNumber][thisCandidate.id].isShown
			) {
				let voteAngle = totalVotes * this.rFactor ;
				let endAngle = currentStartAngle + voteAngle;
				let nextStartAngle = endAngle + arcPadding;
				
				// This is where we decide whether to add extra padding to give space to elected candidates.
				// We could (i) check the reserved seat angles from first principes or (ii) check the resservedSeats array
				for( let j = 0; j<reservedSeats.length; j++ ) {
					if( reservedSeats[j] ) {
						// reservedSeats inherit their angles from the quota-busting candidate vote count, so must
						// refer back to winner boxes
						const midSeatAngle = (this.winnerBoxes[j].startAngle + this.winnerBoxes[j].endAngle)/2;
						if ( currentStartAngle <= midSeatAngle && nextStartAngle > midSeatAngle ) {
							nextStartAngle += arcPadding;
							const midCountAngle = ( currentStartAngle + endAngle ) /2 ;
							
							if ( (midCountAngle+arcPadding/2) >= midSeatAngle ) {
								currentStartAngle += arcPadding;
								endAngle += arcPadding;
							}
						}
					}
				}
				
				this.candidateArcs[countNumber][i] = {
					'candidateId' : thisCandidate.id,
					'candidateClass': 'candidate_' + thisCandidate.id,
					'candidateName' : thisCandidate.name,
					'candidateParty' : thisCandidate.party,
					'slug' : ( 'slug' in thisCandidate ) ? thisCandidate.slug : false,
					'angle' : voteAngle,
					'index': i,
					'startAngle': currentStartAngle,
					'padAngle': 0,
					'endAngle' : endAngle,
					// Used to decide if labels go left or right
					'xSign' : ( currentStartAngle*2+voteAngle < 2*Math.PI ) ? 1: -1,
					'status' : 'count',
					'isNewlyElected1' : this.data.countDict[countNumber][thisCandidate.id].isNewlyElected1,
					// in practice, will always be false becuase isNewlyElected2 never shown
					'isNewlyElected2' : this.data.countDict[countNumber][thisCandidate.id].isNewlyElected2,
					'isFinallyElected' : this.data.countDict[countNumber][thisCandidate.id].isFinallyElected,
					
					'seatIndex' : thisCandidate.status === 'Elected' ? thisCandidate.seatIndex : null
				};
				
				currentStartAngle = nextStartAngle ;
				//console.log('currentStartAngle at loop end', currentStartAngle, 'totalVotes', totalVotes, 'voteAngle', voteAngle, 'arcPadding', arcPadding );
			} else if ( this.data.countDict[countNumber][thisCandidate.id].isNewlyElected2 ) {
				for( let j = 0; j<reservedSeats.length; j++ ) {
					if ( reservedSeats[j] && thisCandidate.id === reservedSeats[j].candidateId ) {
						currentSeats[j] = reservedSeats[j];
					}
					break;
				}
			} else {
				// this.candidateArcs[countNumber][i] = false;
			}
		}
		
		
		// The elected candidates arc is the status at the *start* of the round, so doesn't include newly elected candidates. Deep copy..
		this.electedCandidateArcs[ countNumber ] = [];
		for( const thisReservedSeat of reservedSeats ) {
			if ( thisReservedSeat ) {
				let thisArc = Object.assign({}, thisReservedSeat);
				// reserved seat includes the full vote, not just the vote required to be elected.
				thisArc.angle = this.quotaAngle;
				thisArc.endAngle = thisArc.startAngle + this.quotaAngle;
				this.electedCandidateArcs[ countNumber ].push( thisArc );
			}
		}
		
		// If there's a newly elected candidate, the first candidate will line up with their winning space
		// And there'll need to be a subsequent animation step to line up the others.'
		var newlyElectedCandidateStartAngle;
		if (newlyElectedCandidateIDs.length ) {
			let newlyElectedArcs = $.grep( that.candidateArcs[ countNumber ], function(arc) { return arc !== undefined && arc.isNewlyElected1 ; } );
			if ( newlyElectedCandidateIDs.length > 1 ) {
				debugger; // We expect our input data to do one at a time.
			}
			if ( newlyElectedArcs.length == 0 ) {
				debugger; // This should not happen; we have just created a newlyElected arc for this one.
			}
			
			for( const thisNewlyElectedArc of newlyElectedArcs ) {
			
				let seatIndex = 0; // Declared in apt scope
				for(; seatIndex< this.electedCandidatesBySeat.length; seatIndex++ ) {
					if ( this.electedCandidatesBySeat[seatIndex] == thisNewlyElectedArc.candidateId ) {
						break;
					}
				}
				if ( seatIndex >= this.electedCandidatesBySeat.count ) {
					debugger;
				}
			
				newlyElectedCandidateStartAngle =this.winnerBoxes[seatIndex].startAngle;
				// And then find the difference...
				let angleChange = newlyElectedCandidateStartAngle - thisNewlyElectedArc.startAngle;
				// then apply it..
				for( let i in this.candidateArcs[countNumber] ) {
					if ( this.candidateArcs[countNumber][i] !== undefined ) {
						this.candidateArcs[countNumber][i].startAngle = this.candidateArcs[countNumber][i].startAngle + angleChange;
						this.candidateArcs[countNumber][i].endAngle = this.candidateArcs[countNumber][i].endAngle + angleChange;
					}
				}
				let newWinner = Object.assign({}, thisNewlyElectedArc );
				newWinner = Object.assign( newWinner, this.winnerBoxes[seatIndex] );
				newWinner.seatIndex = seatIndex;
				reservedSeats[seatIndex] = newWinner;
			}
		}
		
		
	}
}

	// Get by value, so that we can then manipulate the datum object as needed.
PrefVoteVizDoughnut.prototype._getCandidateArcs = function( countNumber, isElected ) {
	var arcsToCopy;
	if ( isElected ) {
		arcsToCopy = this.electedCandidateArcs[countNumber];
	} else {
		arcsToCopy = this.candidateArcs[countNumber];
	}
	let retArcs = [];
	for(let i = 0; i<arcsToCopy.length; i++) {
		if ( arcsToCopy[i] !== undefined ) {
			retArcs.push( Object.assign({}, arcsToCopy[i] ));
		}
	}
	return retArcs;
}
	
	// "NewlyElectedArcs" is the quota vote share that gets someone elected; they rise on the "newlyElected2" step
	// Which means they start off on the newlyElected1 step, which means we're really looking at last steps' data
PrefVoteVizDoughnut.prototype.getNewlyElectedRisingArcs = function ( countNumber ) {
	let newlyElectedArcs = [];
	for( const thisCandidateThisArc of this.candidateArcs[countNumber-1] ) {
		if ( thisCandidateThisArc !== undefined && thisCandidateThisArc.isNewlyElected1 ) {
			let thisNewlyElectedArc = Object.assign({}, thisCandidateThisArc );
			thisNewlyElectedArc.angle = this.quotaAngle;
			thisNewlyElectedArc.endAngle = thisNewlyElectedArc.startAngle + this.quotaAngle;
			thisNewlyElectedArc.xSign = ( (thisNewlyElectedArc.startAngle+thisNewlyElectedArc.endAngle) < 2*Math.PI ) ? 1: -1,
			thisNewlyElectedArc.total = this.data.countDict[ countNumber -1 ][ thisNewlyElectedArc.candidateId ].total ;
			newlyElectedArcs.push(  thisNewlyElectedArc );
		}
	}
	
	// Rearrange so that in the final round the first gets animated first.
	newlyElectedArcs.sort( (a,b) => parseFloat(b.total) - parseFloat(a.total) );
	
	return newlyElectedArcs;
}



PrefVoteVizDoughnut.prototype.resetForStep = function() {
	// Remove anything in mid-animation
	this.svg
		.selectAll('*')
		.interrupt();
	this.svg
		.selectAll('.transfer, .transferer, .newlyElected, .fading, .excluded')
		.remove();
}

/*
				let labelPos = that.ARCS.label.centroid(d);
				labelPos[0] = that.INNER_BY_STATUS.label * that.radius * d.xSign ;
				return 'translate(' + labelPos + ')';
				*/
				
PrefVoteVizDoughnut.prototype._labelYPos = function( datum ) {
	let midAngle = ( datum.startAngle + datum.endAngle ) / 2;
	midAngle = midAngle % (2 * Math.PI);
	// proportionate y goes from -1 to +1, depending.
	let yPos;
	if ( midAngle < Math.PI ) {
		yPos = ( 2 * midAngle / Math.PI ) -1 ;
	} else {
		yPos = 3 - ( 2 * midAngle / Math.PI )
	}
	yPos = yPos * this.radius;
	return yPos;
}
	
PrefVoteVizDoughnut.prototype._labelPos = function( datum ) {

	let labelPos = [ this.radius * datum.xSign, this._labelYPos( datum )];
	//Special rule for candidate elected to the 6 o'clock winner slot.
	if ( datum.status == 'elected' && datum.seatIndex == (this.winnerBoxes.length-1) / 2 ) {
		labelPos[0] = 0;
	}
	return 'translate(' + labelPos + ')';
}
	
PrefVoteVizDoughnut.prototype._labelImagePos = function( datum ) {
		let xPos = this.radius * datum.xSign;
		//Special rule for candidate elected to the 6 o'clock winner slot.
		if ( datum.status == 'elected' && datum.seatIndex == (this.winnerBoxes.length-1) / 2 ) {
			xPos = - 0.115 * this.radius ;
		} else if ( datum.xSign < 0 ) {
			xPos = xPos - 0.115 * this.radius ;
		} 
		let labelPos = [ xPos , this._labelYPos(datum) + this.radius/32 ];
		return 'translate(' + labelPos + ')';
	}
	
	
PrefVoteVizDoughnut.prototype._labelPolyline = function( datum ) {
	let startPos = this.ARCS.count.centroid(datum);
	let labelCentroidPos = this.ARCS.label.centroid(datum);
	let yPos = this._labelYPos( datum );
	let labelPos = [ this.radius * datum.xSign,  yPos ];
	// Add the bend.
	if ( yPos ) {
		let radialPortion = yPos / labelCentroidPos[1];
		let bendPos = [ labelCentroidPos[0]*radialPortion, yPos ];
		return [ startPos, bendPos, labelPos ];
	// In this special case there is no need for a bend - and if we tried to calculate
	// where it sits by dividing by the label y-co-ord we'd get division by zero error.
	} else {
		return [ startPos, labelPos ];
	}
}
	
PrefVoteVizDoughnut.prototype.showStep = function( countNum ) {
	//Now set up the arcs in candidate order. I want to store extra data, so I cannot use the pie function
	const that = this;
	
	// Stop any transfer animations in progress
	this.resetForStep();

	this.svg
		.selectAll('path.count')
		.data(this._getCandidateArcs( countNum ), function(d) { return d.candidateId; })
		.join('path') // equivalent to enter().append('path') followed by a join
		.attr('d', this.ARCS.count )
		.attr('class', function(d) { return 'count ' + d.candidateParty + ' ' + d.candidateClass ; } ) //Probably not necessary for update
		.attr('data-candidate-id', function(d) { return d.candidateId ; } )
	;
	
	// Attach lines to labels
	this.svg
		.selectAll('polyline.count')
		.data(this._getCandidateArcs( countNum ), function(d) { return d.candidateId; })
		.join('polyline')
		.attr('class', function(d) { return 'count label ' + d.candidateClass ;  } )
		.attr('points', function(d) { return that._labelPolyline(d); } );
	
	// And labels
	this.svg
		.selectAll('text.count')
		.data(this._getCandidateArcs( countNum ), function(d) { return d.candidateId; })
		.join('text')
		.attr('class', function(d) { return 'count label ' + d.candidateClass ;  } )
		.text( function(d) { return d.candidateName ; })
		.attr('transform', function(d) {
			return that._labelPos( d );
		})
		.style( 'text-anchor', function(d) { return (d.xSign > 0 ) ? 'start': 'end'; })
	;

	// Images
	this.svg
		.selectAll('image.count')
		.data(this._getCandidateArcs( countNum ).filter( function(d){return d.slug;}), function(d) { return d.candidateId; })
		.join('image')
		.attr('class', function(d) { return 'count label ' + d.candidateClass ;  } )
		// COULD  make this more interactive
		.attr('href', function(d) { return that.baseDir + '/' + d.slug + '.png' ; })
		.attr('height', this.radius/8 )
		.attr('transform', function(d) {
			return that._labelImagePos( d );
		})
	;
	
	//And elected candidates
	this.svg
		.selectAll('path.elected')
		.data(this._getCandidateArcs( countNum, true ), function(d) { return d.candidateId ; })
		.join('path')
		.attr('d', this.ARCS.elected )
		.attr('class', function(d) { return 'elected ' + d.candidateParty + ' ' + d.candidateClass ; } ) //P
	;
	// And elected candidate labels
	this.svg
		.selectAll('text.elected')
		.data(this._getCandidateArcs( countNum , true ), function(d) { return d.candidateId; })
		.join('text')
		.text( function(d) { return d.candidateName ; })
		.attr('class', function(d) { return 'elected label ' + d.candidateClass ;  } )
		.attr('transform', function(d) {
			return that._labelPos(d);
		})
		.style( 'text-anchor', function(d) { return (d.xSign > 0 ) ? 'start': 'end'; })
	;

	// Elected candidate Images
	this.svg
		.selectAll('image.elected')
		.data(
			this
			._getCandidateArcs( countNum, true )
			.filter( function(d){return d.slug;}),
			function(d) { return d.candidateId; }
		)
		.join('image')
		.attr('class', function(d) { return 'elected label ' + d.candidateClass ;  } )
		// Feature idea - make this more interactive / configurable
		.attr('href', function(d) { return that.baseDir + '/' + d.slug + '.png' ; })
		.attr('height', this.radius/8 )
		.attr('transform', function(d) {
			return that._labelImagePos( d );
		})
	;
}

PrefVoteVizDoughnut.prototype.updateCandidateText = function( thisCandidate, thisCandidateThisCount ) {
	// Mark as elected or eliminated if apt
	if ( thisCandidateThisCount.status === 'Elected') {
		//console.log('Elected!');
	} else if ( thisCandidateThisCount.status === 'Excluded' ) {
		// If not already removed, remove.
		let $thisCandidateLabelLine = this.svg.selectAll('polyline.count.candidate_' + thisCandidate.id );
		if ( $thisCandidateLabelLine.size() ) {
			$thisCandidateLabelLine
				.classed('fading', true).classed('count',false)
				.transition().duration(150 * this.tick).style('opacity',0).remove();
			
			let $thisCandidateLabel = this.svg.selectAll('text.count.candidate_' + thisCandidate.id + ',image.count.candidate_' + thisCandidate.id );
			$thisCandidateLabel
				.classed('excluded',true).classed('count',false)
				.transition().duration(150 * this.tick).style('opacity',0).remove;
		}

	}
}
	
PrefVoteVizDoughnut.prototype.animateTransfer = async function( countNumber ) {
	// Excluded candidates have been moved out

		// If elected, then we need to split the arc and move it out.
		// Rotate all to line up with winner slot - already done
		// Create new arc(s) to be winner & rise
		// Reduce old one
		// Animated winning arc
		
	const that = this;
	let needToShowStepAtEnd = false; //Happens if an arc appears in mid-animation
	let cumulativeDelay =0; 

	// If someone's elected, we need to split elected away from the transfer. Nicely separated.
	let newlyElectedArcs = this.getNewlyElectedRisingArcs( countNumber );
	let newlyElectedCandidateIds = newlyElectedArcs.map( function(d) { return d.candidateId.toString() ; } );
	
	if ( newlyElectedArcs.length ) {
		const animatedVictoriesPromise = this._animateVictories( newlyElectedArcs );
		await animatedVictoriesPromise;
	}

	var transfererID = null;
	var aTransfererInRace = [];
	var aTransfererElected = [];
	
	for( var c = 0; c < this.data.candidates.length; c++ ) {
		if ( this.data.countDict[ countNumber ][c]['transfers'] ) {
			// "Elected" status happens as soon as they achieve quorum
			if( (countNumber-2) in this.data.countDict && this.data.countDict[countNumber-2][c]['status'] == 'Elected') {
				aTransfererElected.push( c);
			} else {
				aTransfererInRace.push(c);
			}
		// Otherwise, check it's not a newly elected candidate *without* transfers'
		} else if ( newlyElectedCandidateIds.includes( c.toString() ) ) {
			// In which case, remove the residual - faded out in ticks 0-75.
			this.svg
				.selectAll('path.count.candidate_' + c )
				.classed('fading', true)
				.transition()
				.delay( cumulativeDelay ) //should be zero, unless I've added something since writing this comment
				.duration( 75 * this.tick)
				.style('opacity', 0 )
				.remove()
			;
		}
	}
	
	// Placeholder for adding a message (possibly to handle an unusual retransfer with, say, Meek STV)
	if ( aTransfererInRace.length == 0 && aTransfererElected.length > 0 ) {
	
		//debugger ;
		// Needs a message...
		this.svg.append('text')
			.text('Message will go here for count ' + countNumber )
			.attr('class', 'message')
			.attr('text-anchor','middle')
			.transition('textMessage')
			.delay( 2000 * this.tick ) // cumulativeDelay should be zero unless changed since this comment
			.duration(75 * this.tick).style('opacity' ,0)
/*			.on('end.textMessage', function(d,i,n) { alert('end'); debugger ; } )
			.on('interrupt.textMessage', function(d,i,n) { alert ('interrupt'); debugger; } )
			.on('cancel.textMessage', function(d,i,n) { alert('cancel'); debugger; } )
 */			.remove()
		;
		// why is the above not removed?
		this.showStep(countNumber);
		return;
	} else {
		transfererID = aTransfererInRace[0];
	}

	// It's coming from...'
	let $transferArc = 
		this.svg
			.selectAll('path.count.candidate_' + transfererID )
			.classed('transferer', true)
	;
	
	// If you're trying to do a transfer without a transferer, something has gone wrong.
	if ( !$transferArc || !$transferArc.size() ) {
		debugger;
	}
	
	// Transfer proper
	// Firstly the vote share for the transferer moves to the transfer ring.

	// Move old vote into the transfer ring - ticks 0-150 - and fade out.
	let $transferFromTransition = $transferArc	
		.classed('count', false)
		.classed('fading', true) //So we can delete it if the animation is interrupted
		.transition()
		.delay( cumulativeDelay ) // Should be 0 unless changed since this comment
		.duration(  150 * this.tick  )
		.attrTween("d", this._voteStatusTweenFac( 'transfer' ) )
		.transition().duration(75 * this.tick).style('opacity' ,0)
		.remove()
		.on('end', function(datum) { 
			that.updateCandidateText( that.data.candidates[datum.candidateId], that.data.countDict[ countNumber][datum.candidateId]);
		} )
	;
		
	// Set up the new arcs
	if ( ! $transferArc.datum() ) {
		debugger; 
	}
	let currentStartAngle = $transferArc.datum().startAngle;
	let aTransferToArcs = []
	cumulativeDelay = cumulativeDelay + $transferFromTransition.duration();
	
	for (let ordinal=0;ordinal<this.candidateOrder.length; ordinal++) {
		let t = this.candidateOrder[ ordinal ];
		// Find the transferees - any other candidate still standing could be one. (What about first-round-transferees?)
		if ( this.data.countDict[countNumber][ this.data.candidates[t].id ]['transfers'] == false && ( that._withCandidateId( that.candidateArcs[ countNumber ], this.data.candidates[t].id ) !== undefined ) ) {
			
			let voteAngle = this.rFactor * this.data.transferDict[countNumber][ this.data.candidates[t].id ];
			aTransferToArcs.push( {
				candidate: Object.assign({}, this.data.candidates[t]),
				candidateClass: 'candidate_' + this.data.candidates[t].id,
				candidateId: this.data.candidates[t].id,
				candidateName: this.data.candidates[t].name,
				candidateParty: this.data.candidates[t].party,
				angle: voteAngle,
				startAngle: currentStartAngle,
				padAngle: 0,
				endAngle: currentStartAngle + voteAngle,
				status: 'transfer'
			} );
			currentStartAngle += voteAngle;
		}
	}
	
	// data/enter/append will create the transfer arcs as needed (but they begin invisible)
	this.svg
		.selectAll('path.transfer')
		.data(aTransferToArcs)
		.enter()
		.append('path')
		.attr('d', this.ARCS.transfer )
		.style('opacity',0)
		.attr('class', function(d) { return 'transfer ' + d.candidateParty + ' ' + d.candidateClass ; } )
	;
	
	let $splitTransition = d3.selectAll('path.transfer')
		// Fade in the transfers
		.transition()
		.delay ( cumulativeDelay ) 
		.duration(150*this.tick).style('opacity', 1)
		// Move them to the right point in the circle
		.transition() // starts at end of the fade in
		.duration(150*this.tick)
		.attrTween("d",
			function(datum) {
				let candidateId = datum.candidateId;
				let thisCandidateArc = that._withCandidateId( that.candidateArcs[ countNumber ], candidateId );
				if ( thisCandidateArc === undefined ) {
					// entirely plausible if candidate knocked out
					return null;
				} else {
					let newStartAngle = thisCandidateArc.endAngle - datum.angle;
					return that._voteStartAngleTweenFac( datum, newStartAngle );
				}
			}
		)
		// Pause & move them to the count circle
		.transition()
		.duration(150*this.tick)
		.attrTween("d", 
			this._voteStatusTweenFac('count') )
	;
	
	let splitTransitionPromise = $splitTransition.end();
	
		// Usually, they are folded into the existing arc - but sometimes, with a first-round transfer, they can be this 
		// candidate's first votes, and hence a whole new arc.
		// Rather than branch this chain, let's reclass first ... 
	
	// $splitTransition.duration() is not cumulative, it's just the duration of single transition returned ie 150 ticks.
	// This means that the count arcs rotate at the same time as the transfer arcs
	cumulativeDelay += 150*this.tick;
	//cumulativeDelay = 0;
	// The count circle transitions towards the next round *with*
	// - next round's start angle
	// - this round's angle - (Q - does this include transfer val)?
	// - an appropriate tween
	

	// Time is again the problem.
	
	// If the transfer from someone winning puts someone else over the threshold, then they don't turn up in 'path.count'.
	// All of these need to be able to add (an element). Because async, we might not be able to reply to DOM changes
	
	let $pathCount = d3.selectAll('path.count');
	if ( ! $pathCount.empty() ) { // is empty
		//cumulativeDelay = 0;
		let $rotateCountTransition = $pathCount
			.transition()
			.delay ( cumulativeDelay )
			.duration( 150*this.tick)
			.attrTween("d", 
				function(datum) {
					let candidateId = datum.candidateId;
					let thisCandidateArc = that._withCandidateId( that.candidateArcs[ countNumber ], candidateId );
					if ( thisCandidateArc == undefined ) {
						// _withCandidateId is a filter, and can legitimately return nothing
						return null;
					}
					let newStartAngle = thisCandidateArc.startAngle;
					return that._voteStartAngleTweenFac( datum, newStartAngle );
				}
			)
		;
		
		$rotateCountTransition
			.selection()
			.data( this._getCandidateArcs( countNumber, true ), function(d) { return d.candidateId ; } )
		;
		
		// Rotate the lines
		this.svg
			.selectAll('polyline.count')
			.transition()
			.delay( cumulativeDelay )
			.duration( 150*this.tick )
			.attrTween('points',
				function(datum) {
					let candidateId = datum.candidateId;
					let thisCandidateArc = that._withCandidateId( that.candidateArcs[ countNumber ], candidateId );
					// newly eliminated candidate
					if ( thisCandidateArc === undefined ) {
						return null;
					} else {					
						let newStartAngle = thisCandidateArc.startAngle;
						let newEndAngle = thisCandidateArc.endAngle;
						return that._labelLinePointsTweenFac( datum, newStartAngle, newEndAngle );
					}
				}
			)
		;
		
		// Move the label and image 
		
		/* let $rotateLabel = */ d3.selectAll('text.count')
			.transition('moveCandidateText')
			.delay( cumulativeDelay )
			.duration( 150*this.tick )
			.attrTween('transform', 
				function(datum) {
					let candidateId = datum.candidateId;
					let thisCandidateArc = that._withCandidateId( that.candidateArcs[ countNumber ], candidateId );
					// The text could have been deleted between defining and running this transformation, in which case...
					if ( thisCandidateArc === undefined ) {
						return null;
					} else {
						let newStartAngle =thisCandidateArc.startAngle;
						let newEndAngle = thisCandidateArc.endAngle;
						return that._labelPosAngleTweenFac( datum, newStartAngle, newEndAngle );
					}
				}
			)
		;
	
		d3.selectAll('image.count')
			.transition('moveCandidateImage')
			.delay( cumulativeDelay )
			.duration( 150*this.tick )
			.attrTween('transform',
				function (datum) {
					let candidateId = datum.candidateId;
					let thisCandidateArc = that._withCandidateId( that.candidateArcs[ countNumber ], candidateId );
					if ( !datum.slug || thisCandidateArc === undefined ) {
						return null;
					} else {
						let newStartAngle =thisCandidateArc.startAngle;
						let newEndAngle = thisCandidateArc.endAngle;
						return that._angleTweenFac( datum, newStartAngle, newEndAngle, that._labelImagePos );
					}
				}
			)
	
		await $rotateCountTransition.end();		
	} 
	
	await splitTransitionPromise;

	$splitTransition.selection()
		.attr('class',function(d) { return 'count ' + d.candidateParty + ' ' + d.candidateClass ; } )
		.filter( 
			function( datum ) {
				let candidateId = datum.candidateId;
				if ( countNumber > 0 && that.data.countDict[countNumber-1][candidateId].isShown ) {
					return true; // remove redundant arc.
				} else {
					// In this scenario we will now need to assign a label.
					needToShowStepAtEnd = true;
					return false;
				}
			}
		)
		.remove() 
	;

	
			// Set the datum
	that.svg.selectAll('path.count')
		.data( that._getCandidateArcs( countNumber ), function(d) { return d.candidateId; })
		.attr('d', that.ARCS.count )
	;
	
	// In the final round, everything elese that's not elected needs to be moved up
	if ( !( countNumber +1 in this.data.countDict ) ) {
		// If someone's elected, we need to split elected away from the transfer.
		
		// NOte that all we actually need is a list of candidate classes.
		
		let finallyElectedArcs = this.candidateArcs[countNumber].filter( arc => arc.isFinallyElected );
		
		// There could also be two stags to this: the ones already in situ
		// (possibly after transfers) and the "last candidates standing"
		// who only met quota because the quota is shrining with each round,
		// and that's not a factor we're trying to show.
		
		
		if ( finallyElectedArcs.length ) {
		
			// They have to be animated collectively, because:
			// * we don't want the victorious arcs to cross each other
			// * nor do we want them to cross the losing arcs.
			// Thus losing arcs must vanish first.
			await that._animateFinalVictories( finallyElectedArcs );
			//console.log('Deleting detritus left in count...');
			await that.svg.selectAll('path.count,polyline.count,text.count,image.count')
				.classed('fading', true)
				.transition()
				.duration(that.tick * 150)
				.style('opacity',0)
				.remove()
			
		}
		
	} else if ( needToShowStepAtEnd ) {
		//console.log('About to show next step ..');
		this.showStep( countNumber );
	}
	
	
	return true; // 
	
	
}
	
/* When multiple arcs are passed, we need to raise them in a particular order:	
	- decreasing order of vote share
	- then any remainder */
	
PrefVoteVizDoughnut.prototype._animateVictories = async function( newlyElectedArcs ) {

	for( const thisNewlyElectedArc of newlyElectedArcs ) {
		await this._animateVictory( thisNewlyElectedArc );
	}
	
	return true;
}

PrefVoteVizDoughnut.prototype._animateVictory = async function( thisNewlyElectedArc ) {

	const that = this;

	// Truncate the 'count' arc that is about to rise, because part of it will be transferred
	this.svg
		.selectAll('path.count.' + thisNewlyElectedArc.candidateClass)
		.datum( function(d) { 
			let newD = Object.assign( {}, d ); 
			newD.startAngle = newD.startAngle + that.quotaAngle ; 
			return newD; 
		})
		.attr( 'd', this.ARCS.count )
	;

	//Remove the polylines, for both aesthetic and not-mucking-up-other-transitions reasons
	that.svg.selectAll('polyline.count.' + thisNewlyElectedArc.candidateClass )
		.remove();

	// created a new newly elected arc.
	
	let $newlyElectedArc = 
		this.svg
			.append('path')
			.datum( Object.assign({}, thisNewlyElectedArc) )
			.attr('d', this.ARCS.count )
			.attr('class', function (d) { return 'newlyElected ' + d.candidateParty + ' ' + d.candidateClass; })
	;

	let promiseLinedUp = this._rotateVictoriousArcIntoPlace( $newlyElectedArc, thisNewlyElectedArc );

	await promiseLinedUp;
	
	let promiseRaise = this._raiseElectedArcToWinnerBox( $newlyElectedArc );
	return promiseRaise;

}

PrefVoteVizDoughnut.prototype._animateFinalVictories = async function( newlyElectedArcs ) {
	
	// Remove all the polylines - no longer needed.
	this.svg.selectAll('polyline.count').remove();
	
	// We need to get rid of all the non-winners in case they get in the way.
	let candidateSelector = newlyElectedArcs.map( x => '.' + x.candidateClass ).join(",");
	this.svg.selectAll('label.count,path.count')
		.filter(candidateSelector)
		.classed('count',false)
		.classed('newlyElected',true);
		
	let $losingLosers = this.svg.selectAll('label.count,path.count')
		.classed('fading', true).classed('count',false)
		.transition()
		.duration(150 * this.tick)
		.style('opacity',0)
		.remove()
	;
	await $losingLosers.end();
	
	let aPromiseLinedUp = [];
	// Then rotate the ones left
	for( const thisNewlyElectedArc of newlyElectedArcs ) {
		let $thisArc = this.svg.selectAll('path.newlyElected.' + thisNewlyElectedArc.candidateClass);
		let thisPromise = this._rotateVictoriousArcIntoPlace( $thisArc, thisNewlyElectedArc);
		aPromiseLinedUp.push( thisPromise );
	}
	
	await Promise.all(aPromiseLinedUp);
	
	// And then elevate
	let allArcs = this.svg.selectAll('path.newlyElected');
	let promise = this._raiseElectedArcToWinnerBox( allArcs );
	return promise;
}


PrefVoteVizDoughnut.prototype._rotateVictoriousArcIntoPlace = async function( $newlyElectedArc, thisNewlyElectedArc ) {

	let that = this;
	let promiseLinedUp;
	if ( this.winnerBoxes[ thisNewlyElectedArc.seatIndex ].startAngle == $newlyElectedArc.datum().startAngle 
		&& this.winnerBoxes[ thisNewlyElectedArc.seatIndex ].endAngle == $newlyElectedArc.datum().endAngle
	) {
		promiseLinedUp = Promise.resolve(true);
	} else {
		// Must rotate, and when ended, set datum
		
		thisNewlyElectedArc.startAngle = this.winnerBoxes[ thisNewlyElectedArc.seatIndex ].startAngle;
		thisNewlyElectedArc.endAngle = this.winnerBoxes[ thisNewlyElectedArc.seatIndex ].endAngle;
		thisNewlyElectedArc.xSign = this.winnerBoxes[ thisNewlyElectedArc.seatIndex].xSign;
	
		promiseLinedUp = $newlyElectedArc
			.transition()
			.duration( 300 * this.tick )
			.attrTween('d',
				function( datum ) {
					let newStartAngle = thisNewlyElectedArc.startAngle;
					let newEndAngle = thisNewlyElectedArc.endAngle;
					return that._voteStartAngleTweenFac( datum, newStartAngle, newEndAngle );
				}
			)
			.on(
				'end',
				// I doubt this is pass by reference
				function() {
					d3.select(this).datum( thisNewlyElectedArc);
				}
			)
			.end()
		;
		
	}
	
	
	
	// Rotate text and image labels
	
	this.svg
		.select('text.label.' + thisNewlyElectedArc.candidateClass)
		.classed('count',false).classed('elected', true)
		// And also need to move it to the right position
		.datum( thisNewlyElectedArc )
		.style( 'text-anchor', function(d) { return (d.xSign > 0 ) ? 'start': 'end'; })
		.transition()
		.duration( 300 * this.tick )
		.attrTween('transform', 
			function(datum) {
				//let candidateId = datum.candidateId;
				// The text could have been deleted between defining and running this transformation, in which case...
				// But also, are these angles correct?
				let newStartAngle =thisNewlyElectedArc.startAngle;
				let newEndAngle = thisNewlyElectedArc.endAngle;
				return that._labelPosAngleTweenFac( datum, newStartAngle, newEndAngle );
			}
		);
		
		// Similarly for the image
	this.svg
		.select('image.label.' + thisNewlyElectedArc.candidateClass  )
		.classed('count',false).classed('elected', true)
		.datum( thisNewlyElectedArc )
		.transition( 300 * this.tick )
		.attrTween('transform',
			function(datum) {
				//let candidateId = datum.candidateId;
				let newStartAngle =thisNewlyElectedArc.startAngle;
				let newEndAngle = thisNewlyElectedArc.endAngle;
				return that._angleTweenFac( datum, newStartAngle, newEndAngle, that._labelImagePos );
			}
		)
			
	return promiseLinedUp;
}

PrefVoteVizDoughnut.prototype._raiseElectedArcToWinnerBox = async function( $newlyElectedArcs) {

	let $newlyElectedArcRiseTransition = $newlyElectedArcs
			.transition()
			.duration( 300 * this.tick )
			.attrTween("d", this._voteStatusTweenFac('elected'))

			.on('end', function() { 
				this.classList.add('elected'); 
				this.classList.remove('newlyElected');
			} )
	;
	
	// Find that candidate and move them into position and embolden them.
	
				
	return $newlyElectedArcRiseTransition.end();
}


PrefVoteVizDoughnut.prototype._withCandidateId = function ( theseArcs, candidateID ) {
	for ( let i = 0; i< theseArcs.length; i++) {
		if ( theseArcs[i] !== undefined && theseArcs[i].candidateId == candidateID ) {
			return theseArcs[i];
		}
	}
	return undefined;
}
	
PrefVoteVizDoughnut.prototype._voteStatusTweenFac = function( newStatus ) {
	
	// Based on status, as that's stored with data
	const newInnerRadius = this.INNER_BY_STATUS[ newStatus ]*this.radius ;
	const that = this;
	
	// Returns a function that works on any element, after Currying in newInner
	return function (datum) {
		let oldInnerRadius = that.INNER_BY_STATUS [ datum.status ]*that.radius;
		let interpolateInner = d3.interpolateNumber( oldInnerRadius, newInnerRadius );
		datum.status = newStatus;
		
		return function( transitionTime ) {
			datum.innerRadius = interpolateInner( transitionTime );
			datum.outerRadius = that._outerFromInner( datum.innerRadius );
			return d3.arc()( datum ) ;
		}
		
	}
	
}	
	
	/* Changing start angle, end angle fixed. Returns a function that takes the datum & returns a transition function  */
	
PrefVoteVizDoughnut.prototype._voteStartAngleTweenFac = function( datum, newStartAngle, newEndAngle ) {
	const that = this;
	let oldStartAngle = datum.startAngle;
	let oldEndAngle = datum.endAngle;
	if ( !newEndAngle ) {
		newEndAngle = newStartAngle + datum.angle;
	}
	let interpolateStart = d3.interpolateNumber( oldStartAngle, newStartAngle );
	let interpolateEnd = d3.interpolateNumber( oldEndAngle, newEndAngle )
	
	return function( transitionTime ) {
		datum.startAngle = interpolateStart( transitionTime );
		datum.endAngle = interpolateEnd( transitionTime );
		return that.ARCS[ datum.status ]( datum );
	}
}
	
PrefVoteVizDoughnut.prototype._angleTweenFac = function( datum, newStartAngle, newEndAngle, method ) {
	const that = this;

	let oldStartAngle = datum.startAngle;
	let oldEndAngle = datum.endAngle;
	let interpolateStart = d3.interpolateNumber( oldStartAngle, newStartAngle );
	let interpolateEnd = d3.interpolateNumber( oldEndAngle, newEndAngle )
	
	return function( transitionTime ) {
		datum.startAngle = interpolateStart( transitionTime );
		datum.endAngle = interpolateEnd( transitionTime );
		return method.call( that, datum );
	}
			
}
	
PrefVoteVizDoughnut.prototype._labelPosAngleTweenFac = function( datum, newStartAngle, newEndAngle ) {
	const that = this;

	let oldStartAngle = datum.startAngle;
	let oldEndAngle = datum.endAngle;
	let interpolateStart = d3.interpolateNumber( oldStartAngle, newStartAngle );
	let interpolateEnd = d3.interpolateNumber( oldEndAngle, newEndAngle )
	
	return function( transitionTime ) {
		datum.startAngle = interpolateStart( transitionTime );
		datum.endAngle = interpolateEnd( transitionTime );
		return that._labelPos( datum );
	}
	
}
	
PrefVoteVizDoughnut.prototype._labelLinePointsTweenFac = function( datum, newStartAngle, newEndAngle ) {
	const that = this;
	let oldStartAngle = datum.startAngle;
	let oldEndAngle = datum.endAngle;
	let interpolateStart = d3.interpolateNumber( oldStartAngle, newStartAngle );
	let interpolateEnd = d3.interpolateNumber( oldEndAngle, newEndAngle );
	
	return function( transitionTime ) {
		datum.startAngle = interpolateStart( transitionTime );
		datum.endAngle = interpolateEnd( transitionTime );
		return that._labelPolyline( datum );
	}
}
		
PrefVoteVizDoughnut.prototype._outerFromInner  = function (r) {
	return Math.sqrt( r**2 + 0.2*(this.radius**2) ) ;
}	
