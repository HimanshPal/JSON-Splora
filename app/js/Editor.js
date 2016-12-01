/**
 * CodeMirror editor wrapper class
 */

'use strict'

/**
 * Dependencies
 */

const { EventEmitter } = require('events')
const welcomeMessage = require('./welcome-message')
const json5 = require('json5')
const jq = require('node-jq')
const vm = require('vm')

/**
 * Wrapper class for json editor
 */

class Editor extends EventEmitter {

  /**
   * @param {Element} el The textarea element to use for CodeMirror instance
   * @param {jQuery} filter The filter input element
   */

  constructor(el, filter) {
    super()
    this.filter = filter

    // Create CodeMirror element
    this.editor = CodeMirror.fromTextArea(el, {
      gutters: ['CodeMirror-lint-markers'],
      lineNumbers: true,
      smartIndent: true,
      autofocus: true,
      extraKeys: {
        Tab: false
      },
      indentUnit: 2,
      tabSize: 2,
      mode: {
        name: 'javascript',
        json: false
      },
      lint: true
    })

    // Welcome message
    this.editor.setValue(welcomeMessage)

    // Place cursor (after the welcome message)
    this.editor.setCursor({
      line: 10
    })

    // Handle functions that respond to input
    this.handleChangeEvents()
  }

  /**
   * Set the theme dynamically
   */

  setTheme(theme) {
    this.editor.setOption('theme', theme)
  }

  /**
   * Respond to editor and filter input
   */

  handleChangeEvents() {

    // Change event triggers input validation
    this.editor.on('change', _ => {
      this.validate()
    })

    // Paste (Cmd / Cntrl + v) triggers input validation and auto-format
    this.editor.on('inputRead', (cm, e) => {
      if ('paste' == e.origin) {
        this.validate()
        this.formatInput()
      }
    })

    // Run the filter as the user types
    this.filter.on('keyup', _ => {
      this.runFilter()
    })
  }

  /**
   * Validate editor input. Emits 'input-valid' and sets this.data.
   */

  validate() {
    let input = this.editor.getValue()
    try {
      this.data = json5.parse(input)
      this.emit('input-valid')
      return true
    } catch (e) {
      this.data = null
      return false
    }
  }

  /**
   * Formats the code in the editor
   */

  formatInput() {
    if (null !== this.data) {
      this.editor.setValue(JSON.stringify(this.data, null, 2))
    }
  }

  /**
   * Parse raw input as JavaScript first, then JQ
   */

  runFilter() {

    // Define filter here so this function can be called externally without
    // the filter param
    let filter = this.filter.val()

    // Ignore empty filters
    if (!filter || !filter.length) {
      this.emit('filter-empty')
      return
    }

    // This will run 'result=<obj><filter>', and set it on the sandbox object
    let code = `result = x${filter}`
    let sandbox = {
      x: this.data,
      result: null
    }

    // Try to run through JavaScript vm first
    try {
      new vm.Script(code).runInNewContext(sandbox)
      if (sandbox.result) {
        this.emit('filter-valid', {
          result: sandbox.result,
          type: 'js'
        })
      } else {
        this.emit('filter-invalid')
      }
    } catch (e) {

      // If JavaScript filter fails, run through jq
      jq.run(filter, this.data, {
        input: 'json',
        output: 'json'
      }).then(result => {
        if (result === null) {

          // jq returns null for incorrect keys, but we will count them as
          // invalid
          this.emit('filter-invalid')
        } else {

          // The jq filter worked
          this.emit('filter-valid', {
            result: result,
            type: 'jq'
          })
        }
      }).catch(e => {

        // jq filter failed
        this.emit('filter-invalid')
      });
    }
  }
}

/**
 * Exports
 */

module.exports = Editor
