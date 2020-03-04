<!--
/*
  * MIT License
  *
  * Copyright (c) 2020 FABRIC Testbed
  *
  * Permission is hereby granted, free of charge, to any person obtaining a copy
  * of this software and associated documentation files (the "Software"), to deal
  * in the Software without restriction, including without limitation the rights
  * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  * copies of the Software, and to permit persons to whom the Software is
  * furnished to do so, subject to the following conditions:
  *
  * The above copyright notice and this permission notice shall be included in all
  * copies or substantial portions of the Software.
  *
  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  * SOFTWARE.
  *
  */
  -->

$(document).ready(function(){
    // Disable function
    jQuery.fn.extend({
        disable: function(state) {
            return this.each(function() {
                this.disabled = state;
            });
        }
    });
    
    setError = function(message) {
        // Get the error id
        $("#alertmessage").html(message);
        $("#alertmessage").removeClass("alert-success");
        $("#alertmessage").addClass("alert-danger");
        $("#alertmessage").removeClass("invisible");
        
        
    };
    
    setSuccess = function(message) {
        // Get the error id
        $("#alertmessage").html(message);
        $("#alertmessage").removeClass("alert-danger");
        $("#alertmessage").addClass("alert-success");
        $("#alertmessage").removeClass("invisible");
        
    }
    
    
    // When the test button is pushed, perform the test
    
    // Text Box connection
    $("#boxtest").click(function() {
        var button = $(this);
        button.disable(true);
        button.append(" <i id='box_button_busy' class='fa fa-spinner fa-spin'></i>")
      
        // Send the ajax to test the connection
        $.getJSON("/test_box", function( data ) {
            // Check the returned status
            if(data.status == 1) {
                // Everything worked
                if ("sharedLink" in data) {
                    setSuccess(data.statusMessage + ": <a href=\"" + data.sharedLink + "\" target='_blank' >" + data.sharedLink + "</a>");
                } else {
                    setSuccess(data.statusMessage);
                }
            } else {
                // Something failed
                setError(data.statusMessage);
            }
            $('#box_button_busy').remove()
            button.disable(false);
          
          
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            setError(textStatus);
            $('#box_button_busy').remove()
            button.disable(false);
        })
      
      
    });
    
    
});

