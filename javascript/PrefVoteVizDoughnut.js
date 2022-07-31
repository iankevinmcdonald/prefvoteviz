function PrefVoteVizDoughnut( data, options, $target ) {
	PrefVoteVizBaseView.call( this, data, options, $target );
	// radius by proportion of the different doughnuts
	this.INNER_BY_STATUS = {
		'transfer': 0.1,
		'count': 0.5,
		'elected': 0.8,
		'label': 1.01,
	};

	if ( this.$target.find('.quota').length == 0 ) {
		this.$target.append( '<div class="donutAnimation" id="donutAnimation"></div>');
	}

	this._setup();
	this._initCountDict();

}

Object.setPrototypeOf( PrefVoteVizDoughnut.prototype, PrefVoteVizBaseView );

PrefVoteVizDoughnut.prototype._setup = function() {
	let widthPx = $('#donutAnimation').innerWidth();
	
	/*
		The labels add ~ 0.5r on either side and around 0.25r above and below.
		So the overall dimensions are slightly over 3r by 2.5r
		Exact numbers corrected with trial and error.
		*/
	this.radius = Math.min( widthPx / 3.1, (window.innerHeight-90) / 2.5 );
	let heightPx =  this.radius * 2.5;

	// create the base blank SVG object.
	this.svg = d3.select("#donutAnimation")
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

	let innerRadius = this.radius * this.INNER_BY_STATUS.elected;
	let outerRadius = this._outerFromInner( innerRadius);
	for( let i=0; i < this.data.constituency.seats ; i++ ) {
		let thisStartAngle = boxOffset * (i+1) + (this.quotaAngle+boxOffset) * i;
		this.winnerBoxes[ i]= {
			index: i,
			padAngle: 0,
			startAngle: thisStartAngle,
			endAngle: thisStartAngle + this.quotaAngle,
			xSign: thisStartAngle + this.quotaAngle/2 < Math.PI ? 1 : -1,
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
	// Reminder that these are at *end* of round
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
	
	for( let countNumber in this.data.countDict ) {
		//console.log('countNumber',countNumber);
		this.candidateArcs[ countNumber ] = [];
		let votesOnCountRing = 0;
		let candidatesLeft = 0, candidatesElected = 0;
		
		// isNewlyElected1 : passes quota this round, align with winning box
		// isNewlyElected2 : the round they rise to the winning box & transfer (thus feature in electedCandidatesBySeat);
		
		let newlyElectedCandidateIDs = [ ];
		// First pass to work out the spacing and circle start
		for( let i=0; i < this.data.candidates.length; i++) {
			let thisCandidate = this.data.candidates[ this.candidateOrder[i] ];
			let totalVotes = this.data.countDict[countNumber][ thisCandidate.id ].total ;

			// CountDict, unlike the arcs, is indexed by candidateID.
			// Note that "isShown" means "on the main ring", so elected candidates are not shown
			
			if ( totalVotes <= 0 ) {
				this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 = false;
				this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected2 = false;
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
			// We include status = '', and the first two rounds with status = 'Elected'
			} else if ( this.data.countDict[countNumber][ thisCandidate.id ].status  == '' ) {
				this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 = false;
				this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected2 = false;
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = true;
			} else if ( this.data.countDict[countNumber][ thisCandidate.id ].status  == 'Excluded' ) {
				this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 = false;
				this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected2 = false;
				this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
			} else if ( this.data.countDict[countNumber][ thisCandidate.id ].status  == 'Elected' ) {
				// If already moved to the elected box
				if ( (countNumber -2 in this.data.countDict ) && ( this.data.countDict[countNumber-2][ thisCandidate.id ].status  == 'Elected' ) ) {
					
					this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 = false;
					this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected2 = false;
					this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
					candidatesElected ++;
				} else if ( (countNumber -1 in this.data.countDict ) && ( this.data.countDict[countNumber-1][ thisCandidate.id ].status  == 'Elected' ) ) {
					this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 = false;
					this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected2 = true;
					this.data.countDict[countNumber][ thisCandidate.id ].isShown = false;
					// Or this is the first 'Elected' step, in which we show the share going above quota without animating the rise
					candidatesElected ++;
				} else {
					this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected1 = true;
					newlyElectedCandidateIDs.push( thisCandidate.id );
					this.data.countDict[countNumber][ thisCandidate.id ].isNewlyElected2 = false;
					this.data.countDict[countNumber][ thisCandidate.id ].isShown = true;
				}
			}
			


			if ( this.data.countDict[countNumber][ thisCandidate.id ].isShown ) { 
				votesOnCountRing += parseFloat( this.data.countDict[countNumber][ thisCandidate.id ].total );
				candidatesLeft ++;
			} 
			
		}
		
		if (!candidatesLeft) {
			break;
		}
		
		//Padding betweeen each remaining candidate
		let arcPadding = ( 2*Math.PI - this.rFactor * votesOnCountRing ) / ( candidatesLeft + candidatesElected )
		let currentStartAngle = arcPadding /2;
		//console.log( 'arcPadding', arcPadding, 'currentStartAngle', currentStartAngle, 'votesOnCountRing',votesOnCountRing, 'candidatesLeft', candidatesLeft );
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
				
				//console.log('i',i, thisCandidate.name, 'start,end,vote',currentStartAngle,endAngle,voteAngle);
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
			if ( newlyElectedArcs.length == 0 ) {
				debugger; // This should not happen; we have a newlyElected arc for this one.
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
		.selectAll('#donutAnimation *')
		.interrupt();
	this.svg
		.selectAll('#donutAnimation .transfer, #donutAnimation .transferer, #donutAnimation .newlyElected, #donutAnimation .fading, #donutAnimation .excluded')
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
	let radialPortion = yPos / labelCentroidPos[1];
	let bendPos = [ labelCentroidPos[0]*radialPortion, yPos ];
	return [ startPos, bendPos, labelPos ];
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
		.selectAll('#donutAnimation path.elected')
		.data(this._getCandidateArcs( countNum, true ), function(d) { return d.candidateId ; })
		.join('path')
		.attr('d', this.ARCS.elected )
		.attr('class', function(d) { return 'elected ' + d.candidateParty + ' ' + d.candidateClass ; } ) //P
	;
	// And elected candidate labels
	this.svg
		.selectAll('#donutAnimation text.elected')
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
		.selectAll('#donutAnimation image.elected')
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
		console.log('Elected!');
	} else if ( thisCandidateThisCount.status === 'Excluded' ) {
		// If not already removed, remove.
		let $thisCandidateLabelLine = this.svg.selectAll('#donutAnimation polyline.count.candidate_' + thisCandidate.id );
		if ( $thisCandidateLabelLine.size() ) {
			$thisCandidateLabelLine
				.classed('fading', true).classed('count',false)
				.transition().duration(150 * this.tick).style('opacity',0).remove();
			;
			let $thisCandidateLabel = this.svg.selectAll('#donutAnimation text.count.candidate_' + thisCandidate.id + ',#donutAnimation image.count.candidate_' + thisCandidate.id );
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
		
	console.log('animateTransfer(' + countNumber + ')' );

	const that = this;
	let needToShowStepAtEnd = false; //Happens if an arc appears in mid-animation
	let cumulativeDelay =0; 

	// If someone's elected, we need to split elected away from the transfer. Nicely separated.
	let newlyElectedArcs = this.getNewlyElectedRisingArcs( countNumber );
	let newlyElectedCandidateIds = newlyElectedArcs.map( function(d) { return d.candidateId.toString() ; } );
	
	if ( newlyElectedArcs.length ) {
		const $newlyElectedArcRiseTransition = this._animateElection( newlyElectedArcs );
		await $newlyElectedArcRiseTransition.end();
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
				.selectAll('#donutAnimation path.count.candidate_' + c )
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
		// Needs a message...
		this.svg.append('text')
			.text('Message will go here for count ' + countNumber )
			.attr('class', 'message')
			.transition()
			.delay(cumulativeDelay + 75 * this.tick ) // cumulativeDelay should be zero unless changed since this comment
			.duration(75 * this.tick).style('opacity' ,0)
			.remove()
		;
		this.showStep(countNumber);
		return;
	} else {
		transfererID = aTransfererInRace[0];
	}

	// It's coming from...'
	let $transferArc = 
		this.svg
			.selectAll('#donutAnimation path.count.candidate_' + transfererID )
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
	// All of these need to be able to add. Because async, we might not be able to reply to DOM changes
	
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
		
		let $rotateLabel = d3.selectAll('text.count')
			.transition()
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
			.transition()
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
						return that._angleTweenFac( datum, newStartAngle, newEndAngle, '_labelImagePos' );
					}
				}
			)
	
		await $rotateCountTransition.end();
		console.log('$rotateCountTransition ended');
		
	} 
	
	await splitTransitionPromise;
	console.log('$splitTransition ended');

	$splitTransition.selection()
		.attr('class',function(d) { console.log('Adding count to attribute'); return 'count ' + d.candidateParty + ' ' + d.candidateClass ; } )
		.filter( 
			function( datum, index, nodes ) {
				let candidateId = datum.candidateId;
				if ( countNumber > 0 && that.data.countDict[countNumber-1][candidateId].isShown ) {
					console.log('removing transfer arc',datum);
					return true; // remove redundant arc.
				} else {
					// In this scenario we will now need to assign a label.
					console.log('keeping transfer arc',datum);
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
	
	console.log( 'needToShowStepAtEnd',needToShowStepAtEnd, 'countNumber',countNumber);
	// In the final round, everything elese that's not elected needs to be moved up
	if ( !( countNumber +1 in this.data.countDict ) ) {
		console.log ('Inferring final round, countNumber=', countNumber );
		// If someone's elected, we need to split elected away from the transfer.
		let finallyElectedArcs = this.getNewlyElectedRisingArcs( countNumber+1 );
		
		// There could also be two stags to this: the ones already in situ
		// (possibly after transfers) and the "last candidates standing"
		// who only met quota because the quota is shrining with each round,
		// and that's not a factor we're trying to show.
		
		// We actually have two problems here.
		if ( finallyElectedArcs.length ) {
			that._animateElection( finallyElectedArcs );
			await that.svg.selectAll('path.count,polyline.count,text.count,image.count')
				.classed('fading', true)
				.transition()
				.duration(that.tick * 150)
				.style('opacity',0)
				.remove()
			
		}
		
	} else if ( needToShowStepAtEnd ) {
		console.log('About to show next step ..');
		this.showStep( countNumber );
	}
	
	
	return ;
	
	// startAngle & sendAngle are still in the datum ; but we do need a new arc.
	
	
	// I need to define an arc Tween function that changes inner, and an arc tween function that 
	// rotates (or is this just a transform?)
	
}
	
/* When multiple arcs are passed, we need to raise them in a particular order:	
 	- decreasing order of vote share
 	- then any remainder (we don't bother recalculating transfers for final candidates) */
	
PrefVoteVizDoughnut.prototype._animateElection = function( newlyElectedArcs ) {
	const that = this;

//		console.log('_animateElection( newlyElectedArcs= ', newlyElectedArcs );
	// Standardising toString so includes works.
	var newlyElectedCandidateIds = newlyElectedArcs.map( function(d) { return d.candidateId.toString()  ; });
			
	// Change the 'count' arcs that are about to rise
	this.svg
		.selectAll('#donutAnimation path.count')
		// It still has last round's value, so we're checking whether isNewlyElected1 is true when we mean isNewlyElected2'
		.filter( function(d){ 
			return newlyElectedCandidateIds.includes(d.candidateId.toString()) ; 
		} )
		.datum( function(d) { 
			let newD = Object.assign( {}, d ); 
			newD.startAngle = newD.startAngle + that.quotaAngle ; 
			return newD; 
		})
		.attr( 'd', this.ARCS.count )
	;
	//Remove the polylines, for both aesthetic and not-mucking-up-other-transitions reasons
	that.svg.selectAll('#donutAnimation polyline.count')
		.filter( function(d) { 

			return newlyElectedCandidateIds.includes(d.candidateId) ;
		}) 
		.remove();

	let $NewlyElectedArcRiseTransition = 
		this.svg
			.selectAll('#donutAnimation path.newlyElected')
			.data( newlyElectedArcs, function(d) { return d.candidateId ; })
			.join('path')
			.attr('d', this.ARCS.count )
			.attr('class', function(d) { return 'newlyElected ' + d.candidateParty + ' ' + d.candidateClass ; } )
			.each(function(d) {
				that.svg
				.select('text.label.' + d.candidateClass)
				.classed('count',false).classed('elected', true)
				// And also need to move it to the right position
				.data( newlyElectedArcs, function(d) { return d.candidateId ; })
				.style( 'text-anchor', function(d) { return (d.xSign > 0 ) ? 'start': 'end'; })
				.transition()
				.duration( 300 * this.tick )
				.attrTween('transform', 
					function(datum) {
						let candidateId = datum.candidateId;
						let thisCandidateArc = that._withCandidateId( newlyElectedArcs, candidateId );
						// The text could have been deleted between defining and running this transformation, in which case...
						if ( thisCandidateArc === undefined ) {
							debugger;
						} else {
							let newStartAngle =thisCandidateArc.startAngle;
							let newEndAngle = thisCandidateArc.endAngle;
							return that._labelPosAngleTweenFac( datum, newStartAngle, newEndAngle );
						}
					}
				);
				
				// Similarly for the image
				that.svg
				.select('image.label.' + d.candidateClass )
				.classed('count',false).classed('elected', true)
				.data( newlyElectedArcs, function(d) { return d.candidateId ; })
				.transition( 300 * this.tick )
				.attrTween('transform',
					function(datum) {
						let candidateId = datum.candidateId;
						let thisCandidateArc = that._withCandidateId( newlyElectedArcs, candidateId );
						// The image  could have been deleted between defining and running this transformation, in which case...
						if ( thisCandidateArc === undefined ) {
							debugger;
						} else {
							let newStartAngle =thisCandidateArc.startAngle;
							let newEndAngle = thisCandidateArc.endAngle;
							return that._angleTweenFac( datum, newStartAngle, newEndAngle, '_labelImagePos' );
						}
					}
				)
				
			})
			.transition()
			.duration( 300 * this.tick )
			.attrTween("d", this._voteStatusTweenFac('elected'))

			.on('end', function(d) { 
				this.classList.add('elected'); 
				this.classList.remove('newlyElected'); 
			} )
	;
	
	// Find that candidate and move them into position and embolden them.
	
				
	return $NewlyElectedArcRiseTransition;

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
	
PrefVoteVizDoughnut.prototype._voteStartAngleTweenFac = function( datum, newStartAngle ) {
	const that = this;
	//console.log( datum, newStartAngle );
	let oldStartAngle = datum.startAngle;
	let oldEndAngle = datum.endAngle;
	let newEndAngle = newStartAngle + datum.angle;
	let interpolateStart = d3.interpolateNumber( oldStartAngle, newStartAngle );
	let interpolateEnd = d3.interpolateNumber( oldEndAngle, newEndAngle )
	
	return function( transitionTime ) {
		datum.startAngle = interpolateStart( transitionTime );
		datum.endAngle = interpolateEnd( transitionTime );
		return that.ARCS[ datum.status ]( datum );
	}
}
	
PrefVoteVizDoughnut.prototype._angleTweenFac = function( datum, newStartAngle, newEndAngle, methodName ) {
	const that = this;

	let oldStartAngle = datum.startAngle;
	let oldEndAngle = datum.endAngle;
	let interpolateStart = d3.interpolateNumber( oldStartAngle, newStartAngle );
	let interpolateEnd = d3.interpolateNumber( oldEndAngle, newEndAngle )
	
	return function( transitionTime ) {
		datum.startAngle = interpolateStart( transitionTime );
		datum.endAngle = interpolateEnd( transitionTime );
		return that[methodName]( datum );
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
