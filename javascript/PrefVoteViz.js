(function ( $ ) {


// Using prototypes to be backwards-compatible

 
    $.fn.prefVoteViz = function( options ) {
    
    	// Fetch and/or parse it before sending t through to PrefVoteVizControl
    
        if ( typeof(options) == 'string' ) {
        	options = { source: options };
        }
        if ( this.length == 0 ) {
        	console.warn('prefVoteViz called without a target');
        } else if ( this.length > 1 ) {
        	console.warn('prefVoteViz called with multiple targets');
        } else {
        	// Create and affix to the $target 
        	this.data('prefVoteViz', new PrefVoteVizControl( options, this ) );
        }
        
        // PrefVoteFixPrototype.show(options);
        return this;
    };
 
}( jQuery ));