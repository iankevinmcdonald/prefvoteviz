/*
 * Base class for PrefVoteViz views.
 */
 
 
 function PrefVoteVizBaseView ( data, options, $target ) {
	this.data = data;
	this.tick = 4;
 	for ( optionName in options ) {
		switch(optionName) {
			case 'imageDir':
			case 'tick':
				this[optionName] = options[optionName]; 
				break;
			default:
				console.log('Unrecognised option ' + optionName + ' passed to PrefVoteVizBaseView');
		}
	}
	this.$target = $target;
 }
 
PrefVoteVizBaseView.prototype.show = function() {  };

PrefVoteVizBaseView.prototype.showStep = function() { };
PrefVoteVizBaseView.prototype.animateTransfer = function() {  };
PrefVoteVizBaseView.prototype.destroy = function() { this.$target.remove(); } ;