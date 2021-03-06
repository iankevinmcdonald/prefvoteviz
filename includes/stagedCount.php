<?php 

class StagedCount {
    
    const NIELECTION = 1;
    const OPAVOTE = 2;
    const TRANSFERTABLE = 3;
    
    private int $seats; 
    private int $turnout;
    private int $counts;
    private float $quota;
    private array $candidatesDict;
    private array $countDict;
    private array $countMsg;
    private array $transferDict;
    
    /***
     * Can be created various ways.
     */
    public function __construct( $source , int $format  ) {
        $this->candidatesDict = [];
        $this->countDict = [];
        $this->countMsg = [];
        $this->transferDict = [];
        
        // If parsed URL, load
        if ( is_string($source)  &&  $url = filter_var($source, FILTER_VALIDATE_URL)  ) {
            if ( $format == self::OPAVOTE && stripos($url, 'style=json') === false ) {
                $url .= '?style=json';
            }
            $source = file_get_contents( $url );
            
            if ( !$source ) {
                throw new UnexpectedValueException( "Could not read data from url $url");
            }
        }
        
        if ( is_string($source)) {
            // JSON?
            $putativeSource = json_decode($source);
            if ( $putativeSource ) {
                $source = $putativeSource;
            // Try CSV
            } else {
                $source = array_map( 'str_getcsv', explode("\n", $fileIn) );
            }
        }
        
        switch( $format ) {

            case self::OPAVOTE:
                $this->__fromOpaVote($source);
                break;
            case self::TRANSFERTABLE:
                $this->__fromCSV($source);
                break;
            default:
                print "Format $format not supported\n";
                exit;
        }
        
        $this->populateBlankParties();
        /* We need a generate party & styles function? - TODO */
        
    }
    
    
    protected function __fromObject( $obj ) {
        /* OpaVote */
        if ( is_object($obj) &&  property_exists( $obj, 'n_seats' ) ) {
                $this->__fromOpaVote($obj);
        } 
            
    }
    
    protected function __fromCSV($obj) {
        // This is CSV - with rows for candidates and columns for stages.
        
        $firstCandidateRow = null;
        $lastCandidateRow = null;
        
        // We assume that the first column is candidates.
        
        for( $i=0; $i<count($obj); $i++) {
            if ( $firstCandidateRow == null && preg_match('/\d+.?\d*/', trim($obj[$i]['3']) ) ){
                $firstCandidateRow = $i;
                continue;
            }
            if ( stripos( $obj[$i][0], 'exhausted') !== false ||
                stripos( $obj[$i][0], 'non-transfer') !== false ||
                stripos( $obj[$i][0], 'totals') !== false
                ) {
                    $lastCandidateRow = $i-1;
                    break;
                }
        }
        
        if ( $lastCandidateRow === null ) {
            $lastCandidateRow = count($obj)-1;
        }

        $colOffset = 0;
        // If the second column is not numbers, assume it's parties.
        $hasParties = ( stripos( $obj[0][1], 'party') !== false || preg_match( '/[:alpha:]/', $obj[$firstCandidateRow][1]) === 1 );
        if ($hasParties) {
            $colOffset ++;
            $partyCol = 1;
        } else {
            $colOffset = 0;
        }
        
        // * has slugs *?
        $potentialSlugTitle = strtolower(trim($obj[0][ $colOffset + 1 ])); 
        $hasSlugs = ( substr($potentialSlugTitle,0,4) == 'slug' || substr($potentialSlugTitle,0,4) == 'file' );
        if ( $hasSlugs ) {
            $slugCol = $colOffset + 1;
            $colOffset ++;
        }
        
        // Set up the candidates.
        for( $i = $firstCandidateRow; $i<=$lastCandidateRow; $i++) {
            $thisCandidate = [
                'id' => strval( count($this->candidatesDict)),
                'name' => trim( $obj[$i][0] ),
                'status' => ''
            ];
            if ( $hasParties ) {
                $thisCandidate['party'] = trim( $obj[ $i ][$partyCol]);
            }
            if ( $hasSlugs ) {
                $thisCandidate['slug'] = trim( $obj[$i][$slugCol]);
            }
            $this->candidatesDict[] = $thisCandidate;
        }
        
        //Firstly, how many are elected?
        $candidateRows = array_slice( $obj, $firstCandidateRow, count($this->candidatesDict) );
        $resultsColumn = null;
        $this->seats = 0;
        $aWinners=[];
        
        for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
            for( $j = count($candidateRows[$candidateId ])-1; $j ; $j-- ) {
                if ( stripos( $candidateRows[$candidateId ][$j], 'elected') !== false ) {
                    $this->seats++;
                    // Just in case someone puts "elected" in a stage column, get the biggest one.
                    $aWinners[] = $candidateId;
                    if ( $j > $resultsColumn ) {
                        $resultsColumn = $j;
                    }
                    break; // this candidate was elected.
                }
            }
        }
        
        $aCurrentCandidateStatus = array_column( $this->candidatesDict, 'status' ); //Will just create a row of empty strings, but felt better doing it this way
        
        // Based on column count rather than inference from data.
        for( $countIndex = 0; $countIndex*2+$colOffset < $resultsColumn; $countIndex++) {
            $thisCount = [];
            $thisCount = array_map ( function($numVotes)  { return [ 'total' => floatval($numVotes), 'status' => '', 'order' => 0, 'transfers' => false ] ;  } , array_column( $candidateRows, $countIndex*2+1+$colOffset) );
            //print("countIndex=$countIndex\n"); print_r($thisCount);
            
            // Calculate quote each round to be able to see winners.
            $turnout = array_sum( array_column( $candidateRows, $colOffset+1 ));
            $quota = $turnout/($this->seats+1);
            
            // Check for winners.
            for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
                if ($thisCount[$candidateId]['total'] > $quota) {
                    $aCurrentCandidateStatus[ $candidateId ] = 'Elected';
                }
            }
            
            // First round
            if ( !$countIndex ) {
                $thisTransfer = array_pad( [] , count($this->candidatesDict), 0);
                $this->turnout = $turnout;
                $this->quota = $quota;
            } else {
                $thisTransfer = array_column( $candidateRows, $countIndex*2+$colOffset );
                for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
                    if( $thisTransfer[$candidateId]=='-' || !is_numeric( $thisTransfer[$candidateId])) {
                        $thisTransfer[$candidateId] = 0;
                    } else {
                        $thisTransfer[$candidateId] = strval( $thisTransfer[$candidateId]);
                        if ( $thisTransfer[$candidateId] < 0 ) {
                            $thisCount[$candidateId]['transfers'] = true;
                            // Transferring candidates are either elected or eliminated 
                            // And elected are already found.
                            if( array_search($candidateId,$aWinners) === false ) {
                                $aCurrentCandidateStatus[$candidateId] = 'Excluded';
                            }
                        }
                    }
                }
                
                
                //for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
            }
            
            foreach( $aCurrentCandidateStatus as $id => $status ) {
                $thisCount[ $id ]['status'] = $status;
            }
            $this->countDict[] = $thisCount;
            $this->transferDict[] = $thisTransfer;
            
        }
        
        $this->counts = ($resultsColumn-$colOffset)/2;
        
    }
    
    protected function __fromOpaVote($obj) {
        // OpaVote sends votes as whole numbers with a precision, and they need to be divided to be turned into floats.
        $units = 10 ** $obj->precision;
        
        $this->seats = $obj->n_seats ;
        $this->turnout = $obj->n_valid_votes;
        // OpaVote can recalculate the threshold each round
        $this->counts = count($obj->rounds);
        $this->quota = sprintf("%0.2f",  $obj->rounds[ $this->counts - 1]->thresh / $units );
        for( $i = 0 ; $i < count($obj->candidates); $i++ ) {
            // No continuous candidate refs (feature later?)
            /*
             $id = preg_replace( '/\s+/', '', $obj->candidates[$i] );
             $id = strtolower($id); */
            $this->candidatesDict[ strval($i) ] = [
                'id' => strval($i),
                'name' => $obj->candidates[ strval($i) ],
                'status' => '',
                //                    'party' => 'None'
            ];
        }
        
        
        /* A stages round includes transfers (see flag), exclusion, and election */
        /* An OpaVote round show the delta, and shows the result of each Exclusion/Election - but doesn't actually feature it in the data */
        $aCurrentCandidateStatus = array_column( $this->candidatesDict, 'status' ); //Will just create a row of empty strings, but felt better doing it this way
        
        for( $i = 0; $i < count($obj->rounds); $i++ ) {
            $thisCount = array_map ( function($numVotes) use ($units) { return [ 'total' => sprintf("%0.1f", $numVotes/$units), 'status' => '', 'order' => 0, 'transfers' => false ] ;  } , $obj->rounds[$i]->count );
            
            switch( $obj->rounds[$i]->action->type ) {
                case 'first':
                    $thisTransfer = array_pad( [] , count($this->candidatesDict), 0);
                    break;
                case 'surplus':
                    /*
                     // This is for a display, and we do not explicitly display rounds where surplus is transferred from already elected thanks to a
                     // decreasing quota when votes exhaust.
                     if ( $aCurrentCandidateStatus[ $obj->rounds[$i]->action->candidates[0] ] === 'Elected' && $i>1 ) {
                     error_log( "Skipping $i, n=" . $obj->rounds[$i]->n . " ...\n");
                     continue 2;
                     }*/
                    
                case 'eliminate':
                    foreach( $obj->rounds[$i]->action->candidates as $who ) {
                        //                            $aCurrentCandidateStatus[ $who ] = $obj->rounds[$i]->action->type === 'surplus' ? 'Elected' : 'Excluded';
                        //$thisCount[ $who ]['status'] = $aCurrentCandidateStatus[ $who ];
                        $thisCount[ $who ]['transfers'] = true;
                    }
                    // Put the transfers to each candidate in $this->transferDict ;
                    for( $j = 0; $j < count($this->candidatesDict); $j++) {
                        // Maximum of zero because candidates who won/lost both have fewer votes than before.
                        // Transfers are with reference to the previous round (at previous points we had skipped rounds)
                        $thisTransfer[ strval($j) ] = $thisCount[strval($j)]['total'] - $this->countDict[ count($this->countDict)-1 ][strval($j)]['total'];
                    }
                    
                    break;
                    
            }
            
            // Deliberately doing this second so that we'll know whether a winner's surplus is down to their victory or the
            // threshold decreasing due to later vote exhaustion.
            
            // You can get winners in round 1
            foreach( $obj->rounds[$i]->winners as $winner ) {
                $aCurrentCandidateStatus[$winner] = 'Elected';
            }
            
            foreach( $obj->rounds[$i]->losers as $loser ) {
                $aCurrentCandidateStatus[$loser] = 'Excluded';
            }
            
            
            foreach( $aCurrentCandidateStatus as $id => $status ) {
                $thisCount[ $id ]['status'] = $status;
            }
            
            
            $this->countDict[] = $thisCount;
            $this->countMsg[] = $obj->rounds[$i]->msg . '(' . $obj->method . ')';
            $this->transferDict[] = $thisTransfer;
            
        }
    }
    
    public function populateBlankParties() {
        for( $i=0; $i<count($this->candidatesDict); $i++) {
            if ( empty($this->candidatesDict[$i]['party'])) {
                $this->candidatesDict[$i]['party'] = ('None' . chr( ord("A") + ($i % 8)));
            }
        }
    }
    
    /***
     * The output used is a very simple one, with no tracking of exhausted votes,
     * and votes, transfers, and candidates sharing the same implicit index.
     */
    
    public function asArray() {
        return [
            'candidatesDict' => $this->candidatesDict,
            'countDict' => $this->countDict,
            'countMsg' => $this->countMsg,
            'transferDict' => $this->transferDict,
            'constituency' => [
                'seats' => $this->seats,
                'turnout' => $this->turnout,
                'counts' => count($this->countDict),
                'quota' => $this->quota
             ]
        ];
    }
    
}



?>