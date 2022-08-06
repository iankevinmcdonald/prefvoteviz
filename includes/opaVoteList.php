<?php 

/**
 * Grab all contests for the given user as JSON
 */

class OpaVoteList { 

    static function fetch ( string $key, $eid ) {

        if ( $eid ) {
            $aItems = [ [ 'na', $eid ] ] ;
        } else { 
            $itemsJson = file_get_contents( 'https://www.opavote.com/api/v1/items?key=' . $key);
            if ( !$itemsJson ) {
                throw new Exception ('No items JSON found');
                // print json_encode(['status'=>'fail', 'message'=>'No items JSON found']);
            }


            $aItems = json_decode( $itemsJson );

            // print_r($aItems);

            if ( is_object($aItems) && property_exists( $aItems, 'error') && $aItems->error ) {
                throw new Exception('API Error: ' . $aItems->msg);
                //print json_encode(['status'=>'fail', 'message'=>'API Error: ' . $aItems->msg ]);
            }
            if ( !is_array($aItems) ) {
                throw new Exception('Items not valid JSON');
    //            print json_encode(['status'=>'fail', 'message'=>'Items not valid JSON']);
            }
        }
        
        $aContests = [];

        foreach( $aItems as $item ) {
            list( $itemType, $itemID ) = $item;
            $itemJson = file_get_contents( "https://www.opavote.com/api/v1/items/$itemID?key=$key");
            // print $itemJson;
            $aItem = json_decode( $itemJson );
            //print_r($aItem);
            // Status can be EDITING, VOTING, or END, and this makes a difference to what's available.
            if ( $aItem->status == 'EDITING' ) { 
                continue;
            }
            
            $itemTitle = $aItem->title;
            for( $i= 0; $i<count($aItem->contests); $i++) {
                $aContests[] = [
                    'type' => $itemType,
                    'status' => $aItem->status,
                    'reportUrl' => sprintf('https://www.opavote.com/reports/%d/%d?style=json' , $itemID , $i),
                    'voteUrl' => sprintf('https://www.opavote.com/en/vote/%d' , $itemID ),
                    'label' => sprintf("%s - %s", $itemTitle, $aItem->contests[$i]->title),
                    'contestTitle' => $aItem->contests[$i]->title,
                    'description' => $aItem->description,
                    'eid' => $aItem->eid
                ];
            }
        }
        return $aContests ;

    }
    
}

// print json_encode( ['status'=>'ok', 'data'=>$aContests] );
