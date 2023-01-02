/*
 * Base class for PrefVoteViz views.
 */
 
 
function PrefVoteVizBaseView ( data, options, $target ) {
	this.data = data;
	this.tick = 5;
	for ( var optionName in options ) {
		switch(optionName) {
			case 'imageDir':
			case 'tick':
				this[optionName] = options[optionName]; 
				break;
			default:
            	/* istanbul ignore next: warning message that should not be trigerred */
				console.log('Unrecognised option ' + optionName + ' passed to PrefVoteVizBaseView');
		}
	}
	this.$target = $target;
}

PrefVoteVizBaseView.prototype.show = function() {  };

PrefVoteVizBaseView.prototype.showStep = function() { };
PrefVoteVizBaseView.prototype.animateTransfer = async function() {  };
PrefVoteVizBaseView.prototype.destroy = function() { this.$target.remove(); } ;

if ( typeof(module) === 'object' ) {
    module.exports = PrefVoteVizBaseView;
}