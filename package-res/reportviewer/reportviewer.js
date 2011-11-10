var ReportViewer = {

  requiredModules: ['formatter', 'dojo'],

  /**
   * Inform the report viewer that a module has been loaded. When all required modules have been loaded the report
   * viewer will load itself.
   */
  moduleLoaded: function(name) {
    if (this._requiredModules === undefined) {
      // Create a private required modules hash where the value represents if it has been loaded
      this._requiredModules = {};
      $.each(this.requiredModules, function(i, m) {
        this._requiredModules[m] = false; // Modules are by default not loaded
      }.bind(this));
    }
    this._requiredModules[name] = true;

    var everythingLoaded = true;
    $.each(this._requiredModules, function(i, m) {
      everythingLoaded &= m;
      return !everythingLoaded; // break when any module is not loaded
    });
    if (everythingLoaded) {
      ReportViewer._load();
    }
  },

  _load: function() {
    dojo.require('pentaho.common.Messages');
    Messages.addUrlBundle('reportviewer', '../../ws-run/ReportViewerLocalizationService/getJSONBundle');
    this.view.localize();

    this.createRequiredHooks();

    this.view.updatePageBackground();

    dojo.connect(dijit.byId('toolbar-parameterToggle'), "onClick", this, function() {
      this.view.togglePromptPanel();
    }.bind(this));

    this.view.resize();

    $('#reportContent').load(function() {
      // Schedule the resize after the document has been rendered and CSS applied
      setTimeout(ReportViewer.view.resizeIframe.bind(this));
    });

    this.createPromptPanel();
  },

  view: {
    /**
     * Localize the Report Viewer.
     */
    localize: function() {
      $('#toolbar-parameterToggle').attr('title', Messages.getString('parameterToolbarItem_title'));
      dijit.byId('pageControl').registerLocalizationLookup(Messages.getString);
    },

    /**
     * Update the page background when we're not in PUC or we're embedded in an
     * iframe to make sure the translucent styling has some contrast.
     */
    updatePageBackground: function() {
      /**
       * If we're not in PUC or we're in an iframe
       */
      if(!top.mantle_initialized || top !== self) {
        dojo.addClass(document.body, 'pentaho-page-background');
      }
    },

    init: function(init, promptPanel) {
      if (!promptPanel.paramDefn.showParameterUI()) {
        // Hide the toolbar elements
        dojo.addClass('toolbar-parameter-separator', 'hidden');
        dojo.addClass('toolbar-parameterToggle', 'hidden');
      }
      this.showPromptPanel(promptPanel.paramDefn.showParameterUI());
      init.call(promptPanel);
      this.refreshPageControl(promptPanel);
    },

    refreshPageControl: function(promptPanel) {
      var pc = dijit.byId('pageControl');
      pc.registerPageNumberChangeCallback(undefined);
      if (!promptPanel.paramDefn.paginate) {
        pc.setPageCount(1);
        pc.setPageNumber(1);
        // pc.disable();
      } else {
        var total = promptPanel.paramDefn.totalPages;
        var page = promptPanel.paramDefn.page;
        // We can't accept pages out of range. This can happen if we are on a page and then change a parameter value
        // resulting in a new report with less pages. When this happens we'll just reduce the accepted page.
        page = Math.max(0, Math.min(page, total - 1));

        // add our default page, so we can keep this between selections of other parameters, otherwise it will not be on the
        // set of params are default back to zero (page 1)
        promptPanel.setParameterValue(promptPanel.paramDefn.getParameter('accepted-page'), '' + page);
        pc.setPageCount(total);
        pc.setPageNumber(page + 1);
      }
      pc.registerPageNumberChangeCallback(function(pageNumber) {
        this.pageChanged(promptPanel, pageNumber);
      }.bind(this));
    },

    pageChanged: function(promptPanel, pageNumber) {
      promptPanel.setParameterValue(promptPanel.paramDefn.getParameter('accepted-page'), '' + (pageNumber - 1));
      promptPanel.submit(promptPanel);
    },

    togglePromptPanel: function() {
      this.showPromptPanel(dijit.byId('toolbar-parameterToggle').checked);
    },

    showPromptPanel: function(visible) {
      if (visible) {
        dijit.byId('toolbar-parameterToggle').set('checked', true);
        dojo.removeClass('reportControlPanel', 'hidden');
      } else {
        dijit.byId('toolbar-parameterToggle').set('checked', false);
        dojo.addClass('reportControlPanel', 'hidden');
      }
      this.resize();
    },

    resize: function() {
      var ra = dojo.byId('reportArea');
      var c = dojo.coords(ra);
      var windowHeight = dojo.dnd.getViewport().h;

      dojo.marginBox(ra, {h: windowHeight - c.y});
    },

    resizeIframe: function() {
      var t = $(this);
      // Reset the iframe height before polling its contents so the size is correct.
      t.width(0);
      t.height(0);

      var d = $(this.contentWindow.document);
      t.height(d.height());
      t.width(d.width());

      $('#reportPageOutline').width(t.outerWidth());
      ReportViewer.view.resize();
    },

    showMessageBox: function( message, dialogTitle, button1Text, button1Callback, button2Text, button2Callback, blocker ) {

      var messageBox = dijit.byId('messageBox');

      messageBox.setTitle(dialogTitle);
      messageBox.setMessage(message);
      
      if (blocker) {
        messageBox.setButtons([]);
      } else {
        var closeFunc = messageBox.hide.bind(messageBox);

        if(!button1Text) {
          button1Text = Messages.getString('OK');
        }
        if(!button1Callback) {
          button1Callback = closeFunc;
        }

        messageBox.onCancel = closeFunc;

        if(button2Text) {
          messageBox.callbacks = [
            button1Callback, 
            button2Callback
          ];
          messageBox.setButtons([button1Text,button2Text]);
        } else {
          messageBox.callbacks = [
            button1Callback 
          ];
          messageBox.setButtons([button1Text]);
        }
      }
      messageBox.show();
    }
  },

  createPromptPanel: function() {
    var paramDefn = ReportViewer.fetchParameterDefinition();

    var panel = new pentaho.common.prompting.PromptPanel(
      'promptPanel',
      paramDefn);
    panel.submit = ReportViewer.submitReport;
    panel.getParameterDefinition = ReportViewer.fetchParameterDefinition.bind(ReportViewer);
    panel.schedule = ReportViewer.scheduleReport;

    // Provide our own text formatter
    panel.createDataTransportFormatter = ReportViewer.createDataTransportFormatter.bind(ReportViewer);
    panel.createFormatter = ReportViewer.createFormatter.bind(ReportViewer);

    var init = panel.init;
    panel.init = function() {
      this.view.init(init, panel);
    }.bind(this);

    // Provide our own i18n function
    panel.getString = Messages.getString;

    panel.init();
  },

  createRequiredHooks: function(promptPanel) {
    if (window.reportViewer_openUrlInDialog || top.reportViewer_openUrlInDialog) {
      return;
    }
    if (!top.mantle_initialized) {
      top.mantle_openTab = function(name, title, url) {
        window.open(url, '_blank');
      }
    }
    if (top.mantle_initialized) {
      top.reportViewer_openUrlInDialog = function(title, url, width, height) {
        top.urlCommand(url, title, true, width, height);
      }
    } else {
      top.reportViewer_openUrlInDialog = ReportViewer.openUrlInDialog;
    }
    window.reportViewer_openUrlInDialog = top.reportViewer_openUrlInDialog;
    window.reportViewer_hide = ReportViewer.hide;
  },

  getLocale: function() {
    var locale = this.getUrlParameters().locale;
    if (locale && locale.length > 2) {
      locale = locale.substring(0, 2);
    }
    return locale;
  },

  openUrlInDialog: function(title, url, width, height) {
    if (this.dialog === undefined) {
      dojo.require('pentaho.reportviewer.ReportDialog');
      this.dialog = new pentaho.reportviewer.ReportDialog();
      this.dialog.setLocalizationLookupFunction(Messages.getString);
    }
    this.dialog.open(title, url, width, height);
  },

  /**
   * Hide the Report Viewer toolbar.
   */
  hide: function() {
    $('#toppanel').empty();
    ReportViewer.view.resize();
  },

  parameterParser: new pentaho.common.prompting.ParameterXmlParser(),
  parseParameterDefinition: function(xmlString) {
    // Provide a custom parameter normalization method unique to report viewer
    this.parameterParser.normalizeParameterValue = ReportViewer.normalizeParameterValue.bind(ReportViewer);
    return this.parameterParser.parseParameterXml(xmlString);
  },

  getUrlParameters: function() {
    var urlParams = {};
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        reg = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        query = window.location.search.substring(1);

    while (e = reg.exec(query)) {
      var paramName = decode(e[1]);
      var paramVal = decode(e[2]);

      if (urlParams[paramName] !== undefined) {
        paramVal = $.isArray(urlParams[paramName]) 
          ? urlParams[paramName].concat([paramVal])
          : [urlParams[paramName], paramVal];
      }
      urlParams[paramName] = paramVal;
    }
    return urlParams;
  },

  /**
   * Loads the parameter xml definition from the server.
   * @param promptPanel panel to fetch parameter definition for
   * @param mode Render Mode to request from server: {INITIAL, MANUAL, USERINPUT}. If not provided, INITIAL will be used.
   */
  fetchParameterDefinition: function(promptPanel, mode) {
    var options = this.getUrlParameters();
    // If we aren't passed a prompt panel this is the first request
    if (promptPanel) {
      $.extend(options, promptPanel.getParameterValues());
    }

    options['renderMode'] = 'XML';

    if (mode === 'USERINPUT' && !promptPanel.paramDefn.allowAutoSubmit()) {
      // only parameter without pagination of content ..
      options['renderMode'] = 'PARAMETER';
    }

    // options['renderMode'] = promptPanel ? 'XML': 'PARAMETER';

    // Never send the session back. This is generated by the server.
    delete options['::session'];

    var authenticationCallback = function() {
      var newParamDefn = ReportViewer.fetchParameterDefinition.call(this, promptPanel, mode);
      promptPanel.refresh(newParamDefn);
    }.bind(this);

    var newParamDefn;
    $.ajax({
      async: false,
      cache: false,
      type: 'POST',
      url: webAppPath + '/content/reporting',
      data: options,
      dataType:'text',
      success: function(xmlString) {
        if (ReportViewer.handleSessionTimeout(xmlString, authenticationCallback)) {
          return;
        }
        try {
          newParamDefn = ReportViewer.parseParameterDefinition(xmlString);
          // Make sure we retrain the current auto-submit setting
          var currentAutoSubmit = promptPanel ? promptPanel.getAutoSubmitSetting() : undefined;
          if (currentAutoSubmit != undefined) {
            newParamDefn.autoSubmitUI = currentAutoSubmit;
          }
        } catch (e) {
          alert('Error parsing parameter xml: ' + e); // TODO Replace with error dialog
        }
      }.bind(this),
      error: function(xml) {
        alert('Error loading parameter information: ' + xml); // TODO replace with error dialog
      }
    });
    return newParamDefn;
  },

  _updateReport: function(promptPanel, renderMode) {
    if (promptPanel.paramDefn.promptNeeded) {
      $('#' + this.htmlObject).attr('src', 'about:blank');
      return; // Don't do anything if we need to prompt
    }
    var options = this.getUrlParameters();
    $.extend(options, promptPanel.getParameterValues());
    options['renderMode'] = renderMode;

    // SimpleReportingComponent expects name to be set
    if (options['name'] === undefined) {
      options['name'] = options['action'];
    }

    // Never send the session back. This is generated by the server.
    delete options['::session'];

    var url = "/pentaho/content/reporting?";
    var params = [];
    var addParam = function(encodedKey, value) {
      if(value.length > 0) {
        params.push(encodedKey + '=' + encodeURIComponent(value));
      }
    }
    $.each(options, function(key, value) {
      if (value === null || typeof value == 'undefined') {
        return; // continue
      }
      var encodedKey = encodeURIComponent(key);
      if ($.isArray(value)) {
        var val = [];
        $.each(value, function(i, v) {
          addParam(encodedKey, v);
        });
      } else {
        addParam(encodedKey, value);
      }
    });

    url += params.join("&");
    var iframe = $('#reportContent');
    iframe.attr("src", url);
  },

  submitReport: function(promptPanel) {
    ReportViewer._updateReport(promptPanel, 'REPORT');
  },

  scheduleReport: function(promptPanel) {
    ReportViewer._updateReport(promptPanel, 'SUBSCRIBE');
  },

  /**
   * Prompts the user to relog in if they're within PUC, otherwise displays a dialog
   * indicating their session has expired.
   *
   * @return true if the session has timed out
   */
  handleSessionTimeout: function(content, callback) {
    if (this.isLoginPageContent(content)) {
      this.reauthenticate(callback);
      return true;
    }
    return false;
  },

  /**
   * @return true if the content is the login page.
   */
  isLoginPageContent: function(content) {
    if(content.indexOf('j_spring_security_check') != -1) {
        // looks like we have the login page returned to us
        return true;
    }
    return false;
  },

  reauthenticate: function(f) {
    if(top.mantle_initialized) {
      var callback = {
        loginCallback : f
      }
      window.parent.authenticate(callback);
    } else {
      ReportViewer.view.showMessageBox(
        Messages.getString('SessionExpiredComment'),
        Messages.getString('SessionExpired'),
        Messages.getString('OK'), 
        ReportViewer.view.closeMessageBox,
        undefined,
        undefined,
        true
      );
        // ,
        // Messages.getString('No_txt'), 
        // ReportViewer.view.closeMessageBox);
    }
  },

  /**
   * Create a text formatter that formats to/from text. This is designed to convert between data formatted as a string
   * and the Reporting Engine's expected format for that object type.
   * e.g. "01/01/2003" <-> "2003-01-01T00:00:00.000-0500"
   */
  createDataTransportFormatter: function(paramDefn, parameter, pattern) {
    var formatterType = this._formatTypeMap[parameter.type];
    if (formatterType == 'number') {
      return {
        format: function(number) {
          return '' + number;
        },
        parse: function(s) {
          return s;
        }
      }
    } else if (formatterType == 'date') {
      return this._createDateTransportFormatter(parameter);
    }
  },

  /**
   * Create a text formatter that can convert between a parameter's defined format and the transport
   * format the Pentaho Reporting Engine expects.
   */
  createFormatter: function(paramDefn, parameter, pattern) {
    if (!jsTextFormatter) {
      console.log("Unable to find formatter module. No text formatting will be possible.");
      return;
    }
    // Create a formatter if a date format was provided and we're not a list parameter type. They are
    // mutually exclusive.
    var dataFormat = pattern || parameter.attributes['data-format'];
    if (!parameter.list && dataFormat) {
      return jsTextFormatter.createFormatter(parameter.type, dataFormat);
    }
  },

  _formatTypeMap: {
    'number': 'number',
    'java.lang.Number': 'number',
    'java.lang.Byte': 'number',
    'java.lang.Short': 'number',
    'java.lang.Integer': 'number',
    'java.lang.Long': 'number',
    'java.lang.Float': 'number',
    'java.lang.Double': 'number',
    'java.math.BigDecimal': 'number',
    'java.math.BigInteger': 'number',
    
    'date': 'date',
    'java.util.Date': 'date',
    'java.sql.Date': 'date',
    'java.sql.Time': 'date',
    'java.sql.Timestamp': 'date'
  },

  _initDateFormatters: function() {
    // Lazily create all date formatters since we may not have createFormatter available when we're loaded
    if (!this.dateFormatters) {
      this.dateFormatters = {
        'with-timezone': jsTextFormatter.createFormatter('date', "yyyy-MM-dd'T'HH:mm:ss.SSSZ"),
        'without-timezone': jsTextFormatter.createFormatter('date', "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        'utc': jsTextFormatter.createFormatter('date', "yyyy-MM-dd'T'HH:mm:ss.SSS'+0000'"),
        'simple': jsTextFormatter.createFormatter('date', "yyyy-MM-dd")
      }
    }
  },

  /**
   * Create a formatter to pass data to/from the Pentaho Reporting Engine. This is to maintain compatibility
   * with the Parameter XML output from the Report Viewer.
   */
  _createDataTransportFormatter: function(parameter, formatter) {
    var formatterType = this._formatTypeMap[parameter.type];
    if (formatterType == 'number') {
      return {
        format: function(object) {
          return formatter.format(object);
        },
        parse: function(s) {
          return '' + formatter.parse(s);
        }
      }
    } else if (formatterType == 'date') {
      var transportFormatter = this._createDateTransportFormatter(parameter);
      return {
        format: function(dateString) {
          return formatter.format(transportFormatter.parse(dateString));
        },
        parse: function(s) {
          return transportFormatter.format(formatter.parse(s));
        }
      }
    }
  },

  /**
   * This text formatter converts a Date to/from the internal transport format (ISO-8601) used by Pentaho Reporting Engine
   * and found in parameter xml generated for Report Viewer.
   */
  _createDateTransportFormatter: function(parameter, s) {
    var timezone = parameter.attributes['timezone'];
    this._initDateFormatters();
    return {
      format: function(date) {
        if ('client' === timezone) {
          return this.dateFormatters['with-timezone'].format(date);
        }
        // Take the date string as it comes from the server, cut out the timezone information - the
        // server will supply its own here.
        if (parameter.timezoneHint) {
          if (!this.dateFormatters[parameter.timezoneHint]) {
            this.dateFormatters[parameter.timezoneHint] = jsTextFormatter.createFormatter('date', "yyyy-MM-dd'T'HH:mm:ss.SSS" + "'" + parameter.timezoneHint + "'");
          }
          return this.dateFormatters[parameter.timezoneHint].format(date);
        } else {
          if ('server' === timezone || !timezone) {
            return this.dateFormatters['without-timezone'].format(date);
          } else if ('utc' === timezone) {
            return this.dateFormatters['utc'].format(date);
          } else {
            var offset = ReportViewer.timeutil.getOffsetAsString(timezone);
            if (!this.dateFormatters[offset]) {
              this.dateFormatters[offset] = jsTextFormatter.createFormatter('date', "yyyy-MM-dd'T'HH:mm:ss.SSS'" + offset + "'");
            }
            return this.dateFormatters[offset].format(date);
          }
        }
      }.bind(this),
      parse: function(s) {
        if ('client' === timezone) {
          try {
            // Try to parse with timezone info
            return this.dateFormatters['with-timezone'].parse(s);
          } catch (e) {
            // ignore, keep trying
          }
        }
        try {
          return this.parseDateWithoutTimezoneInfo(s);
        } catch (e) {
          // ignore, keep trying
        }
        try {
          if (s.length == 10) {
            return this.dateFormatters['simple'].parse(s);
          }
        } catch (e) {
          // ignore, keep trying
        }
        try {
          return new Date(parseFloat(s));
        } catch (e) {
          // ignore, we're done here
        }
        return ''; // this represents a null in CDF
      }.bind(this)
    };
  },

  parseDateWithoutTimezoneInfo: function(dateString) {
    // Try to parse without timezone info
    if (dateString.length === 28)
    {
      dateString = dateString.substring(0, 23);
    }
    return this.dateFormatters['without-timezone'].parse(dateString);
  },

  /**
   * Updates date values to make sure the timezone information is correct.
   */
  normalizeParameterValue: function(parameter, type, value) {
    if (value == null || type == null) {
      return null;
    }

    // Strip out actual type from Java array types
    var m = type.match('^\\[L([^;]+);$');
    if (m != null && m.length === 2) {
      type = m[1];
    }

    switch(type) {
      case 'java.util.Date':
      case 'java.sql.Date':
      case 'java.sql.Time':
      case 'java.sql.Timestamp':
        var timezone = parameter.attributes['timezone'];
        if (!timezone || timezone == 'server') {
          if (parameter.timezoneHint == undefined) {
            // Extract timezone hint from data if we can and update the parameter
            if (value.length == 28) {
              // Update the parameter's timezone hint
              parameter.timezoneHint = value.substring(23, 28);
            }
          }
          return value;
        }

        if(timezone == 'client') {
          return value;
        }

        // for every other mode (fixed timezone modes), translate the time into the specified timezone
        if ((parameter.timezoneHint != undefined && $.trim(parameter.timezoneHint).length != 0)
         && value.match(parameter.timezoneHint + '$'))
        {
          return value;
        }

        // the resulting time will have the same universal time as the original one, but the string
        // will match the timeoffset specified in the timezone.
        return this.convertTimeStampToTimeZone(value, timezone);
    }
    return value;
  },

  /**
   * Converts a time from a arbitary timezone into the local timezone. The timestamp value remains unchanged,
   * but the string representation changes to reflect the give timezone.
   *
   * @param value the timestamp as string in UTC format
   * @param timezone the target timezone
   * @return the converted timestamp string.
   */
  convertTimeStampToTimeZone: function(value, timezone) {
    this._initDateFormatters();
    // Lookup the offset in minutes
    var offset = ReportViewer.timeutil.getOffset(timezone);

    var localDate = this.parseDateWithoutTimezoneInfo(value);
    var utcDate = this.dateFormatters['with-timezone'].parse(value);
    var offsetText = ReportViewer.timeutil.formatOffset(offset);

    var nativeOffset = -(new Date().getTimezoneOffset());

    var time = localDate.getTime() + (offset * 60000) + (utcDate.getTime() - localDate.getTime() - (nativeOffset * 60000));
    var localDateWithShift = new Date(time);

    return this.dateFormatters['without-timezone'].format(localDateWithShift) + offsetText;
  }
};