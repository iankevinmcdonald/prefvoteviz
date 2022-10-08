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
        if ( is_string($source) && strlen($source) < 255 ) {
            if ( $url = filter_var($source, FILTER_VALIDATE_URL)  ) {
                // switch to CSV
                if ( $format == self::OPAVOTE ) {
                    $oUrl = parse_url( $url );
                    $url = ($oUrl['scheme'] ?? 'https' ) . 
                        '://' .
                        $oUrl['host'] .
                        $oUrl['path'] .
                        '?style=csv'
                    ;
                }
                $source = file_get_contents( $url );
                
                if ( !$source ) {
                    throw new UnexpectedValueException( "Could not read data from url $url");
                }
            } else if ( file_exists($source) ) {
                $source = file_get_contents( $source ) ;
                if ( !$source ) {
                    throw new UnexpectedValueException( "Could not read data from file $source");
                }
            }
        }
        
        if ( is_string($source)) {
            // No longer trying JSON
            $source = array_map( 'str_getcsv', explode("\n", $source) );
        }
        
        switch( $format ) {

            case self::OPAVOTE:
            case self::TRANSFERTABLE:
                $this->__fromCSV($source);
                //error_log(json_encode($this->candidatesDict));
                //error_log(json_encode($this->countDict));
                
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
    
    protected function __fromCSV($aIn) {
        // This is CSV Transfer Table - with rows for candidates and columns for stages.
        
        /* Format has:
         * extra fields that are either 2 columns, or 1 column colon-separated
         * then an optional blank line
         * then the actual transfer table
         *
         * The transfer table has a column headed candidates, a column headed 'First preferences', and between them optional other columns.
         * Then their are paired transfer columns
         * Then one final column that says 'elected' by elected candidates.
         */
        
        $firstCandidateRow = null;
        $lastCandidateRow = null;
        
        // We do not currently use extra info, but we might.
        $extraInfo = [];
        
        // Some start with a set of two column rows:
        for ($i=0; $i<count($aIn); $i++ ) {
            
            // How many columns, excluding contiguous blank ones?
            for( $colCount = count($aIn[$i]); $colCount > 0 && empty( $aIn[$i][$colCount-1] ); $colCount-- );
            
            switch ( $colCount ) {
                case 0: //ignore
                case 1: //ignore genuine, but might be colon separated.
                    if ( stripos( $aIn[$i][0], ':') !== false ) {
                        list( $key, $value) = explode(':', $aIn[$i][0]);
                        $extraInfo[ trim($key) ] = trim($value); 
                    }
                    break;
                case 2: // Used by Civica & OpaVote for extra info
                    $extraInfo[ trim($aIn[$i][0]) ] = trim( $aIn[$i][1] ); 
                    break;
                default:    // 
                    break 2; // break out of switch & loop
            }
        }

        $firstHeadingRow = $i;
        // We assume that the first column is candidates.
        for( ; $i<count($aIn); $i++) {
            // Still look for a row of numbers 
            if ( $firstCandidateRow == null ) {
                // The surest indication is a candidates row heading
                $col0 = trim(strtolower( $aIn[$i][0]) );
                if ( $col0 == 'candidates' ) {
                // Because of the way that long column headings can be combined and separated, the word "candidate" could easily end up a couple of rows ahead of its subjects.
                // So the next filled row below it is the first candidate row.
                    for( $i++ ; !$aIn[$i][0]; $i++);
                    $firstCandidateRow = $i;
                    continue;
                /* The pattern for a results row is:
                 * - one non-num col (candidates)
                 * - other non-num cols that might be blank
                 * - one integer col
                 * - other columns that are numeric or blank but not alnum
                 * - optionally, "Elected"
                 */
                } else if ( $col0 && !is_numeric($col0) ) { // first col passed
                    // find the first integer col.
                    $firstIntegerCol = false;
                    for( $col=1; $col<count($aIn[$i]); $col++ ) {
                        if ( $aIn[$i][$col] != '' && (int) $aIn[$i][$col] == $aIn[$i][$col] ) {
                            $firstIntegerCol = $col;
                            break;
                        }
                    }
                    if ( !$firstIntegerCol ) {
                       continue;
                    }
                    
                    // Could also confirm there's nothing numeric *before* the first integer col
                    
                    for ( $col=$firstIntegerCol+1; $col< count($aIn[$i]); $col++ ) {
                        $val = strtolower(trim($aIn[$i][$col]));
                        // Drop out if an unacceptable value found
                        if ( $val && $val != '-' && $val != 'elected' && !is_numeric($val) ) {
                            continue 2;
                        }   
                    }
                    
                    // If you have survived this comparison, then this is presumably the first row of data.
                    $firstCandidateRow = $i;
                    continue;
                }
                
            }
            // If we get to these columns, we're done
            if ( stripos( $aIn[$i][0], 'exhausted') !== false ||
                stripos( $aIn[$i][0], 'non-transfer') !== false ||
                stripos( $aIn[$i][0], 'totals') !== false
                ) {
                    $lastCandidateRow = $i-1;
                    break;
                }
        }
        
        if ( $lastCandidateRow === null ) {
            $lastCandidateRow = count($aIn)-1;
        }

        $hasSlugs = $hasParties = 0;

        // Check further non-numeric columns until we get to "preferences".
        for ( $col = 1; !is_numeric( $aIn[$firstCandidateRow][$col] ); $col++) {
            // Alpha numeric column 
            switch( strtolower( trim($aIn[$firstCandidateRow-1][$col]) ) ) {
                case 'slug':
                case 'file':
                    if ( !$hasSlugs ) {
                        $hasSlugs = 1;
                        $slugCol = $col;
                    } else {
                        print "Warning: unidentified column $col\n";
                    }
                    break;
                case 'party':
                case 'parties':
                default:
                    if ( !$hasParties ) {
                        $hasParties = 1;
                        $partyCol = $col;
                    } else {
                        print "Warning: unidentified column $col\n";
                    }
                    break;
            }
        }
        
        $colOffset = $col-1;
        // A minimal table has a candidates column followed by a 1st preferences column, and an $offset of zero?
        // In between the single column for round 1 & the '<' comparison with the results column, it's easier to work with a base of zero.
        
        // Candidates with zero votes are very rare in real-world elections (people generally vote for themselves), but quite common in 
        // demonstration elections. And we don't want them to clog up the results.
        
        $candidateRows=[];
        for( $i = $firstCandidateRow; $i<=$lastCandidateRow; $i++) {
            // Are there any vote totals more than zero?
            for( $j = $colOffset; isset($aIn[$i][$j]); $j+= 2 ) {
                // If this candidate gets any votes at any point (bearing in mind that in some STV forms candidates can start with zero but receive transfers)
                if ( $aIn[$i][$j] > 0 ) {
                    $candidateRows[] = $aIn[$i];
                    break; // done with j look but not i-loop
                }
            }
        }
        // Set up the candidates.
        
        for( $i = 0; $i < count($candidateRows); $i++) {
            $name = trim( $candidateRows[$i][0] );
            $thisCandidate = [
                'id' => strval( count($this->candidatesDict)),
                'name' => $name,
                'status' => ''
            ];
            // Check for useful parentheticals
            $aMatches = [];
            if ( preg_match( '/\s*\(.*?\)\s*/', $name, $aMatches ) ) {
                $parenthetical = trim( $aMatches[0], "\t\r\n ()");
                $unparenthetical = str_replace( $aMatches[0], ' ', $name );
                $unparenthetical = trim($unparenthetical);
                if ( $parenthetical && $unparenthetical ) {
                    $thisCandidate['parenthetical'] = $parenthetical;
                    $thisCandidate['unparenthetical'] = $unparenthetical;
                }
            }
            
            if ( $hasParties ) {
                $thisCandidate['party'] = trim( $candidateRows[ $i ][$partyCol]);
            }
            if ( $hasSlugs ) {
                $thisCandidate['slug'] = trim( $candidateRows[$i][$slugCol]);
            }
            $this->candidatesDict[] = $thisCandidate;
        }
        
        if ( !$hasParties && count( array_filter( array_column( $this->candidatesDict, 'parenthetical'))) > count( $this->candidatesDict) / 2 ) {
            for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
                if ( $this->candidatesDict[ $candidateId ]['parenthetical'] ) {
                    $this->candidatesDict[ $candidateId ]['_nameRaw'] = $this->candidatesDict[ $candidateId ]['name'];
                    // We will be able to turn parentheses into parties when we have a db of parties. Until then, not.
                    // $this->candidatesDict[ $candidateId ]['party'] = $this->candidatesDict[ $candidateId ]['parenthetical'];
                    $this->candidatesDict[ $candidateId ]['name'] = $this->candidatesDict[ $candidateId ]['unparenthetical'];
                }
            }
        }
        
        //error_log(__METHOD__ . ':' . __LINE__ . ' candidateRows=' . json_encode($candidateRows));
        $resultsColumn = null;
        $this->seats = 0;
        $aWinners=[];
        
        for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
            for( $j = count($candidateRows[$candidateId ])-1; $j ; $j-- ) {
                if ( stripos( $candidateRows[$candidateId ][$j], 'elected') !== false ) {
                    $this->seats++;
                    // Just in case someone puts "elected" in a stage column, get the biggest one.
                    $aWinners[] = $candidateId;
                    $this->candidatesDict[$candidateId]['status'] = 'Elected';
                    if ( $j > $resultsColumn ) {
                        $resultsColumn = $j;
                    }
                    break; // this candidate was elected.
                }
            }
        }
        
        if ( !empty($extraInfo['Number to be elected']) && count($aWinners) != $extraInfo['Number to be elected'] ) {
            throw new Exception( "Error: Number to be elected = " . $extraInfo['Number to be elected'] . " but different number of winners: " . implode(',',$aWinners));
        }
            
        $aCurrentCandidateStatus = array_fill( 0, count($this->candidatesDict), '' ); //start with row of empty strings
        
        // Based on column count rather than inference from data.
        for( $countIndex = 0; $countIndex*2+$colOffset < $resultsColumn; $countIndex++) {
            $thisCount = [];
            $thisCount = array_map ( 
                function($numVotes)  { 
                    return [ 
                        'total' => floatval($numVotes), 
                        'status' => '', 
                        'order' => 0, 
                        'transfers' => false 
                    ] ;  
                } , 
                array_column( $candidateRows, $countIndex*2+1+$colOffset) 
            );
            
            // This count message set up from those messages.
            $thisCountMessage = '';
            for( $row = $firstHeadingRow; $row < $firstCandidateRow; $row++) {
                $thisCountMessage .= implode( ' ', array_slice($aIn[$row],$countIndex*2+$colOffset,2)) . ' ';
            }
            $thisCountMessage = preg_replace('/\s+/', ' ', trim($thisCountMessage));
            //print("countIndex=$countIndex\n"); print_r($thisCount);
            
            // Calculate quote each round to be able to see winners.
            $turnout = array_sum( array_column( $candidateRows, $colOffset+1 ));
            $quota = $turnout/($this->seats+1);
            
            // Check for winners.
            // First round
            if ( !$countIndex ) {
                $thisTransfer = array_pad( [] , count($this->candidatesDict), 0);
                $this->turnout = $turnout;
                $this->quota = $quota;
            } else {
                $thisTransfer = array_column( $candidateRows, $countIndex*2+$colOffset );
                //error_log(__METHOD__ . ':' . __LINE__ . " countIndex=$countIndex colOffset=$colOffset thisTransfer=" . json_encode($thisTransfer));
                $foundTransferer = false;
                for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
                    if( $thisTransfer[$candidateId]=='-' || !is_numeric( $thisTransfer[$candidateId])) {
                        $thisTransfer[$candidateId] = 0;
                    } else {
                        $thisTransfer[$candidateId] = strval( $thisTransfer[$candidateId]);
                        if ( $thisTransfer[$candidateId] < 0 ) {
                            $foundTransferer = true;
                            $thisCount[$candidateId]['transfers'] = true;
                            // Transferring candidates are either elected or eliminated 
                            if( array_search($candidateId,$aWinners) === false ) {
                                $aCurrentCandidateStatus[$candidateId] = 'Excluded';
                            // This should only happen if the STV variant has reduced the quota accounting for non-transfer votes,
                            // and the winner wasn't picked up earlier because its count was below the original quota
                            } else {
                                //error_log(__METHOD__ . ':' . __LINE__ . " setting candidateId=$candidateId Elected countIndex=$countIndex thisTransfer=" . $thisTransfer[$candidateId]);
                                $aCurrentCandidateStatus[$candidateId] = 'Elected';
                            }
                        }
                    }
                }
                
                if ( !$foundTransferer ) {
                    $foundElected = false;
                    // If no-one is transferring, then presumably someone is elected without transfer?
                    // (Or we could be looking at the elimination of a non-scoring candidate).
                    for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
                        // We are looking for something not already eliminated or elected
                        if ( $aCurrentCandidateStatus[$candidateId] || empty($thisCount[$candidateId]['total']) ) {
                            continue;
                        } else if ( ($thisCount[$candidateId]['total'] > $this->quota) && in_array($candidateId,$aWinners)  ) {
                            // Assume only one ...
                            $aCurrentCandidateStatus[$candidateId] = 'Elected';
                            //error_log(__METHOD__ . ':' . __LINE__ . " setting candidateId=$candidateId Elected countIndex=$countIndex quota=$quota thisCount=" . $thisCount[$candidateId]['total']);
                            $foundElected = true;
                            break;
                        }
                    }
                    
                    // If there's no transfer or election, then we should not be recording this round.
                    if ( !$foundElected ) {
                        continue;
                    }
                }
                
                
                //for( $candidateId = 0; $candidateId < count($this->candidatesDict); $candidateId++ ) {
            }
            
            foreach( $aCurrentCandidateStatus as $id => $status ) {
                $thisCount[ $id ]['status'] = $status;
            }
            $this->countDict[] = $thisCount;
            $this->transferDict[] = $thisTransfer;
            $this->countMsg[] = $thisCountMessage;
        }
        
        $this->counts = count($this->countDict);
        
        // In the final round, some win through being left standing. So make sure they all are.
        // Reversal: in the final round, we look at candidatesDict[status] to pick up the rest
/*        foreach( $aWinners as $winnerId ) {
            $this->countDict[ $this->counts - 1][$winnerId]['status'] = 'Elected';
        } */
        
    }
    
    protected function __fromOpaVote($opaData) {
        // OpaVote sends votes as whole numbers with a precision, and they need to be divided to be turned into floats.
        $units = 10 ** $opaData->precision;
        
        $this->seats = $opaData->n_seats ;
        $this->turnout = $opaData->n_valid_votes;
        // OpaVote can recalculate the threshold each round
        
        // OpaVote also includes candidates with zero votes - firstly all qualifying candidates are elected, then
        // candidates with no votes are eliminated. We need to skip any such candidates and rounds. 
        // This means we're going to need a candidate mapping.
        
        //$this->counts = count($opaData->rounds);
        $this->quota = sprintf("%0.2f",  $opaData->rounds[ count($opaData->rounds) - 1]->thresh / $units );
        $cToOut = [];
        $cOut = 0;
        for( $c = 0 ; $c < count($opaData->candidates); $c++ ) {
            $cS = strval($c);
            // has any votes at any point?
            $hasVotes = count(
                array_filter( 
                    array_map( 
                        function($round) use ($cS) { return $round->count[ $cS ] > 0; },
                        $opaData->rounds
                    )
                )
            );
            // If so, include in a candidate.
            if ( $hasVotes ) {
                $this->candidatesDict[ strval($cOut) ] = [
                    'id' => strval($cOut),
                    'name' => $opaData->candidates[ strval($c) ],
                    'status' => '',
                    //                    'party' => 'None'
                ];
                // mapping array to future use
                $cToOut[ $c]= $cOut;
                $cOut++;
            }
        }
        
        /* A stages round includes transfers (see flag), exclusion, and election */
        /* An OpaVote round show the delta, and shows the result of each Exclusion/Election - but doesn't actually feature it in the data */
        
        // OpaVote contests actually declare someone a winner *before* their surplus.
        $aCurrentCandidateStatus = array_column( $this->candidatesDict, 'status' ); //Will just create a row of empty strings, but felt better doing it this way
        
        $rOut = 0;
        for( $r = 0; $r < count($opaData->rounds); $r++ ) {
            $thisCount = 
                array_filter(
                    array_map ( 
                        function($numVotes) use ($units) { return [ 'total' => sprintf("%0.1f", $numVotes/$units), 'status' => '', 'order' => 0, 'transfers' => false ] ;  } 
                        , $opaData->rounds[$r]->count 
                    ),
                    function($cIn) use ($cToOut) { return array_key_exists( $cIn, $cToOut ); }, //filter out the ones we don't want
                    ARRAY_FILTER_USE_KEY
                )
            ;
            // Reindex using the output candidate ids
            $thisCount = array_values($thisCount);
            
            switch( $opaData->rounds[$r]->action->type ) {
                case 'first':
                    $thisTransfer = array_pad( [] , count($this->candidatesDict), 0);
                    break;
                case 'surplus':
                    /*
                     // This is for a display, and we do not explicitly display rounds where surplus is transferred from already elected thanks to a
                     // decreasing quota when votes exhaust.
                     if ( $aCurrentCandidateStatus[ $opaData->rounds[$r]->action->candidates[0] ] === 'Elected' && $r>1 ) {
                     error_log( "Skipping $r, n=" . $opaData->rounds[$r]->n . " ...\n");
                     continue 2;
                     }*/
                    
                case 'eliminate':
                    $roundIsShown = false;
                    foreach( $opaData->rounds[$r]->action->candidates as $who ) {
                        if ( isset($cToOut[$who] )) {
                            $thisCount[$cToOut[$who]]['transfers'] = true;
                            $roundIsShown = true;
                        }
                    }
                    if ( !$roundIsShown ) {
                        continue 2; // "switch" a syntatic loop; this continues the for loop.
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
            foreach( $opaData->rounds[$r]->winners as $winner ) {
                $aCurrentCandidateStatus[$cToOut[$winner] ] = 'Elected';
            }
            
            foreach( $opaData->rounds[$r]->losers as $loser ) {
                if ( isset($cToOut[$loser]) ) {
                    $aCurrentCandidateStatus[$cToOut[$loser]] = 'Excluded';
                }
            }
            
            
            foreach( $aCurrentCandidateStatus as $id => $status ) {
                $thisCount[ $id ]['status'] = $status;
            }
            
            
            $this->countDict[] = $thisCount;
            $this->countMsg[] = $opaData->rounds[$r]->msg . '(' . $opaData->method . ')';
            $this->transferDict[] = $thisTransfer;
            $rOut++; // now set to next round
        }
        $this->counts = $rOut;
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