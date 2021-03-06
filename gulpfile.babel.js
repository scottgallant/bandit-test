import BrowserSync from "browser-sync"
import browserSyncConfig from "./.browsersyncrc.js"
import del from "del"
import fs from "fs"
import gulp from "gulp"
import GulpConfig from "./gulp.config.js"
import hugo from "hugo-bin"
import named from "vinyl-named"
import newer from "gulp-newer"
import {dirname, basename} from "path"
import postcss from "gulp-postcss"
import rename from "gulp-rename"
import runsequence from "run-sequence"
import {spawn} from "child_process"
import sprite from "gulp-svg-sprite"
import sourcemaps from "gulp-sourcemaps"
import through from "through2"
import util from "gulp-util"
import webpack from "webpack-stream"
import webpackConfig from "./.webpackrc.js"

const env = (process.env.HUGO_ENV = process.env.NODE_ENV || "development")
const argsType = process.env.HUGO_ARGS || env
const isProduction = env === "production"
const browserSync = BrowserSync.create()
const gulpConfig = GulpConfig()

let ENV_VARS = process.env
if (argsType !== "production" && fs.existsSync("./.env.js")) {
  ENV_VARS = require("./.env.js").default
}

/**
 * @task hugo
 * Runs hugo with environment-based
 * build arguments
 */
gulp.task("hugo", cb => build(cb))

/**
 * @task server
 * Initializes browsersync server and
 * sets up watch tasks to rebuild
 */
gulp.task("server", ["build"], () => {
  browserSync.init(browserSyncConfig())
  gulp.watch(gulpConfig.styles.watch, ["styles"])
  gulp.watch(gulpConfig.scripts.watch, ["scripts"])
  gulp.watch(gulpConfig.svg.watch, ["svg"])
  gulp.watch(
    [
      gulpConfig.dest + "/**/*",
      `!${gulpConfig.styles.dest}/**/*`,
      `!${gulpConfig.scripts.dest}/**/*`
    ],
    ["hugo"]
  )
})

/**
 * @task build
 * Builds all static assets, and then
 * compiles the static site with Hugo
 */
gulp.task("build", ["clean"], cb => {
  runsequence(["styles", "scripts", "svg"], "hugo", cb)
})

/**
 * @task styles
 * Compiles all css
 */
gulp.task("styles", cb => {
  runsequence("styles:production", "styles:development", cb)
})

/**
 * @task styles:production
 * Compiles the production-ready CSS to project folder
 * and streams it if its a production server environment
 */
gulp.task("styles:production", cb => {
  const task = gulp
    .src(gulpConfig.styles.src)
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(
      postcss({env: "production"}).on("error", err =>
        log(err, err.toString(), "PostCSS")
      )
    )
    .pipe(sourcemaps.write("."))
    .pipe(
      rename(path => {
        path.dirname = "/"

        if (path.extname.indexOf(".map") < 0) path.extname = ".min.css"

        return path
      })
    )
    .pipe(gulp.dest(gulpConfig.styles.dest))

  if (isProduction) {
    task.pipe(browserSync.stream())
  }

  return task
})

/**
 * @task styles:development
 * Generates the non-production styles to temp folder
 * and streams it if its a development server environment
 */
gulp.task("styles:development", cb => {
  if (isProduction) return cb()

  return gulp
    .src(gulpConfig.styles.src)
    .pipe(postcss().on("error", err => log(err, err.toString(), "PostCSS")))
    .pipe(
      rename(path => {
        path.dirname = "/"

        if (path.extname.indexOf(".map") < 0) path.extname = ".min.css"

        return path
      })
    )
    .pipe(gulp.dest(gulpConfig.styles.tmp))
    .pipe(browserSync.stream())
})

/**
 * @task scripts
 * Compiles all js
 */
gulp.task("scripts", cb => {
  runsequence("scripts:production", "scripts:development", cb)
})

/**
 * @task scripts:production
 * Compiles the production-ready JS to project folder
 * and streams it if its a production server environment
 */
gulp.task("scripts:production", cb => {
  const task = gulp
    .src(gulpConfig.scripts.src)
    .pipe(named())
    .pipe(
      webpack(webpackConfig("production")).on("error", function(err) {
        log(err, err.toString(), "Webpack")
        this.emit("end")
      })
    )
    .pipe(
      rename(path => {
        if (path.extname === ".js") path.extname = ".min.js"

        return path
      })
    )
    .pipe(gulp.dest(gulpConfig.scripts.dest))

  if (isProduction) {
    task.pipe(browserSync.stream())
  }

  return task
})

/**
 * @task scripts:development
 * Generates the non-production styles to temp folder
 * and streams it if its a development server environment
 */
gulp.task("scripts:development", cb => {
  if (isProduction) return cb()

  return gulp
    .src(gulpConfig.scripts.src)
    .pipe(named())
    .pipe(
      webpack(webpackConfig()).on("error", function(err) {
        log(err, err.toString(), "Webpack")
        this.emit("end")
      })
    )
    .pipe(
      rename(path => {
        if (path.extname === ".js") path.extname = ".min.js"

        return path
      })
    )
    .pipe(gulp.dest(gulpConfig.scripts.tmp))
    .pipe(browserSync.stream())
})

/**
 * @task svg
 * Generates an SVG symbol for use in
 * theme and layouts
 */
gulp.task("svg", () => {
  return gulp
    .src(gulpConfig.svg.src)
    .pipe(newer(gulpConfig.svg.dest))
    .pipe(
      sprite(gulpConfig.svg.config).on("error", err =>
        log(err, err.toString(), "SVG Sprite")
      )
    )
    .pipe(gulp.dest(gulpConfig.svg.dest))
    .pipe(browserSync.stream())
})

/**
 * @task clean
 * Cleans the build and temp directories
 */
gulp.task("clean", () => {
  return del([gulpConfig.tmp, gulpConfig.build], {dot: true})
})

/**
 * Execute Hugo with Build Arguments based
 * upon environment variables
 * @param {Function} cb
 */
function build(cb) {
  const args = gulpConfig.hugoArgs.default.concat(
    gulpConfig.hugoArgs[argsType] || []
  )
  const generator = spawn(hugo, args, {stdio: "pipe", encoding: "utf-8"})

  generator.stdout.on("data", data => {
    log(null, data.toString(), "Hugo")
  })

  generator.stderr.on("data", data => {
    log(null, data.toString(), "Hugo")
  })

  generator.on("error", err => {
    log(err, err.toString(), "Hugo")
    cb("Build failed")
  })

  generator.on("close", code => {
    browserSync.reload()
    cb()
  })
}

/**
 * Logs errors and messages to the
 * console
 *
 * @param {Error} err
 * @param {String} log
 * @param {String} name
 */
function log(err, log, name) {
  const messages = log.replace(/^,|,$/g, "").split("\n") // Get rid leading/trailing commas
  const spacer = " ".repeat(name.length + 2) // Indent additional lines

  if (err) {
    util.beep()
    browserSync.notify(err.message)
  }

  messages.forEach((message, i) => {
    if (i === 0) {
      util.log("[" + util.colors.blue(name) + "]", message)
    } else {
      util.log(spacer, message)
    }
  })
}
