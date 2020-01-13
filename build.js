const fs = require('fs-extra'),
    path = require('path'),
    os = require('os'),
    config = require('./config'),
    getPathInfo = (strPath, debug) => {
        const result = {
                type: undefined,                                    // 类型 'dir'|'file'
                extension: undefined,                               // 扩展名 'undefined|空|xxx'
                name: undefined,                                    // 文件名 不包含扩展名部分
                isExist: undefined                                  // 是否存在
            };
    
        if(!strPath){
            return result;
        };
        try {
            let stat = fs.statSync(strPath);
    
            //如果路径是一个目录，则返回目录信息
            if (stat.isDirectory()) {
                result.type = 'dir';
                result.isExist = true;
    
                let backPath = path.resolve(strPath, '../'), // 跳到路径上一级目录
                    dirName = strPath.replace(backPath, ''), // 去除上级目录路径
                    re = /[/]|[\\]/g;
    
                result.name = dirName.replace(re, '');             // 去除处理路径后的/\符号
                return result;
            };
    
            if (stat.isFile()) {
                result.type = 'file';
                result.isExist = true;
            };
    
            if (stat.isSymbolicLink()){
                result.type = 'symlink';
                result.isExist = true;
            };
        } catch (error) {
            if (debug) {
                console.log(`${strPath} 文件不存在, ${error}`);
            };
        };
        result.extension = (() => {
            let extName = path.extname(strPath);
            return extName[0] === '.' ? extName.slice(1) : extName;
        })();
        result.name = path.basename(strPath, `.${result.extension}`);
        return result;
    };

class Build{
    constructor(option){
        const _ts = this;
        _ts.tplPath = path.join('decode.wxml');
        _ts.option = option;
        _ts.line = _ts.option.debug ? `\r\n` : '';

        _ts.outDir = path.join(os.homedir(),'desktop','towxml');
        _ts.tplDir = path.join(__dirname);
    }
    
    init(){
        const _ts = this;
        this.writeTpl();

        // 清空输出目录
        fs.emptyDirSync(_ts.outDir);
        let paths = (()=>{
            let result = [];
            
            // 添加根目录文件
            ['config','decode','index','towxml'].forEach(item => {
                let itemPaths = (()=>{
                    let arr = [];
                    ['js','json','wxml','wxss'].forEach(ext => {
                        let itemPath = path.join(_ts.tplDir,`${item}.${ext}`),
                            itemPathInfo = getPathInfo(itemPath);

                        // 文件或目录存在，则添加至拷贝队列
                        if(itemPathInfo.type){
                            arr.push(itemPath);
                        };
                    });
                    return arr;
                })();

                itemPaths.forEach(item => {
                    result.push(item);
                });
            });

            // 添加自定义组件文件
            config.components.forEach(item => {
                let itemPath = path.join(_ts.tplDir,item),
                    itemPathInfo = getPathInfo(itemPath);
                if(itemPathInfo.type === 'dir'){
                    result.push(itemPath);
                }else{
                    console.log(`自定义组件 ${itemPath} 目录不存在`);
                };
            });

            // 添加样式目录
            result.push(path.join(_ts.tplDir,'style'));

            // 添加转换
            result.push(path.join(_ts.tplDir,'parse'));

            return result;
        })(),
        parseDir = path.join(_ts.tplDir,'parse'),
        highlight = path.join(parseDir,'highlight'),
        highlightLang = path.join(highlight,'languages',path.sep),
        markdownPlugins = path.join(parseDir,'markdown','plugins',path.sep),
        
        allowFiles = (()=>{
            let files = {};
            config.highlight.forEach(item => {
                let itemPath = path.join(highlightLang,`${item}.js`);
                files[itemPath] = 1;
            });

            config.markdown.forEach(item => {
                let itemPath = path.join(markdownPlugins,`${item}.js`);
                files[itemPath] = 1;
            });
            return files;
        })();

        // 复制相应的文件
        paths.forEach(item => {
            let dist = item.replace(_ts.tplDir,_ts.outDir);
            fs.copySync(item,dist,{
                filter:function(src,dist){
                    // 如果highlight未启用则忽略该目录
                    if(config.highlight.length){
                        if(src.indexOf(highlightLang) === 0){
                            return allowFiles[src] === 1;
                        };
                    }else{
                        if(path.join(src,path.sep).indexOf(highlight) === 0){
                            return false;
                        };
                    };

                    // 如果markdown扩展全部禁用则忽略所有插件
                    if(config.markdown.length){
                        if(src.indexOf(markdownPlugins) === 0){
                            return allowFiles[src] === 1;
                        };
                    }else{
                        if(path.join(src,path.sep).indexOf(markdownPlugins) === 0){
                            return false;
                        };
                    };

                    let srcInfo = getPathInfo(src);
                    return srcInfo.isExist && srcInfo.name[0] !== '.';
                }
            });
        });

        // 启用highlight扩展
        let markdownIndex = path.join(_ts.outDir,'parse','markdown','index.js');
        if(!config.highlight.length){
            let str = fs.readFileSync(markdownIndex,'utf8');
            str = str.replace(/hljs =/g,'\/\/ hljs =');
            fs.writeFileSync(markdownIndex,str);
        };

        console.log(`构建完成，请将『`,_ts.outDir,`』目录复制到小程序项目目录下`);
    }

    // 输出模版
    writeTpl(){
        const _ts = this,
            components = (()=>{
                let str = ``;
                [...config.wxml,...config.components].forEach(item => {
                    str += _ts.getComponent(item);
                });
                return str;
            })(),
            str = `<block wx:for="{{nodes.child}}" wx:for-index="i" wx:for-item="item" wx:key="i">${_ts.line}${_ts.tab(1)}<block wx:if="{{item.tag===undefined}}">{{item.text}}</block>${_ts.line}${components}</block>`;
        fs.writeFileSync(_ts.tplPath,str);
    }

    // 获取渲染模版
    getComponent(tag){
        const _ts = this;
        let attrs = _ts.getAttr(tag),
            obj = (()=>{
                let result = {};
                config.components.forEach(item => {
                    result[item] = `${_ts.tab(1)}<block wx:if="{{item.tag==='${tag}'}}">${_ts.line}${_ts.tab(2)}<${item} data="{{item}}"/>${_ts.line}${_ts.tab(1)}</block>${_ts.line}`;
                });
                return result;
            })();

        if(tag && obj[tag]){
            return obj[tag];
        }else if(tag){
            return `${_ts.tab(1)}<${tag} wx:if="{{item.tag==='${tag}'}}" ${attrs}>${_ts.line}${_ts.tab(2)}<decode wx:if="{{item.child}}" nodes="{{item}}"/>${_ts.line}${_ts.tab(1)}</${tag}>${_ts.line}`;
        }else{
            return `${_ts.tab(1)}<block wx:if="{{item.tag===undefined}}">{{item.text}}</block>${_ts.line}`;
        };
    }

    // 获取标签所对应的属性
    getAttr(tag){
        let result = '',
            obj = (()=>{
                let result = {};
                result['data-data'] = "{{item}}";
                config.attrs.forEach(item => {
                    result[item] = `{{item.attr.${item}}}`
                });
                return result;
            })(),

            // 事件绑定方式
            bindType = config.bindType;
            
        // 添加事件属性
        config.events.forEach(item => {
            if(item === 'change'){
                if(tag === 'checkbox-group'){
                    obj[`${bindType}:${item}`] = `_${item}`;
                };
            }else{
                obj[`${bindType}:${item}`] = `_${item}`;
            };  
        });

        switch (tag) {
            case 'video':
                obj.poster="{{item.attr.poster}}";
                obj.src="{{item.attr.src}}";
            break;
            case 'image':
                obj.src="{{item.attr.src}}";
                obj.mode="{{item.attr.mode ? item.attr.mode : 'widthFix'}}";
                obj['lazy-load']="{{item.attr['lazy-load']}}"
            break;
            case 'navigator':
                obj.url="{{item.attr.href}}";
            break;
            case 'checkbox-group':
                obj.bindchange="{{item.attr.bindchange}}"
            break;
            case 'checkbox':
                obj.checked="{{item.attr.checked}}"
                obj.value="{{item.attr.value}}"
            break;
            case 'radio':
                obj.checked="{{item.attr.checked}}"
            break;
        };

        for(let key in obj){
            result += `${key}="${obj[key]}" `;
        };
        result = result.substr(0,result.length-1);
        return result;
    }

    // 得到tab缩进字符
    tab(len){
        let str = '',
            option = this.option;
        if(option.debug){
            for(let i=0; i<len; i++){
                str += '\t';
            };
        };
        return str;
    }
};

new Build({
    debug:true
}).init();