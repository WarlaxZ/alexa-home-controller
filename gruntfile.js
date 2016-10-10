module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        // This line makes your node configurations available for use
        pkg: grunt.file.readJSON('package.json'),
        // This is where we configure JSHint
        jshint: {
            // You get to make the name
            // The paths tell JSHint which files to validate
            all: ['./**/*.js'],
             options: {
                 esversion: 6,
                 node: true,
//                 jshintrc: true,
                 ignores: [
                    'node_modules/**/*.js',
                    'apps/**/node_modules/**/*.js'
                ]
             }
         },
         'npm-install-all': {
            src: ['apps/**'],
         },
     });
    // Each plugin must be loaded following this pattern
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-npm-install-all');

    grunt.registerTask('default', ['jshint', 'npm-install-all']);
};
