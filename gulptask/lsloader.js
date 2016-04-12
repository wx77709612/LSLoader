/**
 * lsloader 动态异步加载,css需要注意防止reflow ,js需要注意所有同步顺序脚本都要用lsloader编译,避免出错
 * codestartv1 ls版本号,改动这个版本号 所有ls作废.
 * lsloader.load(name,path)
 * name  根据路径生成的唯一localStorage key
 * path 线上的打包后文件路径
 */

(function(){


    window.lsloader = {
        jsRunSequence:[], //js 运行队列 {name:代码name,code:代码,status:状态 failed/loading,path:线上路径}
        jsnamemap:{},     //js name map 防fallback 重复请求资源
        cssnamemap:{}      //css name map 防fallback 重复请求资源
    };

    //读取资源到模板中
    lsloader.load = function(jsname,jspath){
        var code;
        try{
            code = localStorage.getItem(jsname);
        }catch (e){
            code = '';
        }
        if(!/\/\*codestartv1\*\//.test(code)){   //ls 版本 codestartv1 每次换这个版本 所有ls作废
            this.removeLS(jsname);
            this.requestResource(jsname,jspath);
            return
        }
        //取出对应文件名下的code
        if(code){
            var versionNumber = code.split('/*codestartv1*/')[0]; //取出路径版本号 如果要加载的和ls里的不同,清理,重写
            if(versionNumber!=jspath){
                this.removeLS(jsname);
                this.requestResource(jsname,jspath);
                return
            }
            code = code.split('/*codestartv1*/')[1];
            if(/\.js$/.test(versionNumber)){
                this.jsRunSequence.push({name:jsname,code:code})
                this.runjs(jspath,jsname,code);
            }else{
                document.getElementById(jsname).appendChild(document.createTextNode(code))
            }
        }else{
            //null xhr获取资源
            this.requestResource(jsname,jspath);
        }
    };
    //卸载storage中的资源
    lsloader.removeLS = function(key){
        localStorage.removeItem(key)
    };

    lsloader.requestResource = function(name,path){
        if(/\.js$/.test(path)) {
            var that = this
            this.iojs(path,name,function(path,name,code){
                try {
                    localStorage.setItem(name, path + '/*codestartv1*/' + code);
                } catch (e) {
                }
                that.runjs(path,name,code);
            })
        }else if(/\.css$/.test(path)){
            this.iocss(path,name,function(code){
                document.getElementById(name).appendChild(document.createTextNode(code));
                try{
                    localStorage.setItem(name,path+'/*codestartv1*/'+code);
                }catch(e){
                }
            })
        }

    };

    //ajax 请求资源
    lsloader.iojs = function(path,jsname,callback){
        var that = this;
        that.jsRunSequence.push({name:jsname,code:''})
        try{
            var xhr = new XMLHttpRequest();
            xhr.open("get",path,true);
            xhr.onreadystatechange = function(){
                if (xhr.readyState == 4){
                    if((xhr.status >=200 && xhr.status < 300 ) || xhr.status == 304){
                        if(xhr.response!=''){
                            callback(path,jsname,xhr.response);
                            return;
                        }
                    }
                    that.jsfallback(path,jsname);
                }
            };
            xhr.send(null);
        }catch(e){
            that.jsfallback(path,jsname);
        }

    };

    lsloader.iocss = function(path,jsname,callback){
        var that = this;
        try{
            var xhr = new XMLHttpRequest();
            xhr.open("get",path,true);
            xhr.onreadystatechange = function(){
                if (xhr.readyState == 4){
                    if((xhr.status >=200 && xhr.status < 300 ) || xhr.status == 304){
                        if(xhr.response!=''){
                            callback(xhr.response);
                            return;
                        }
                    }
                    that.cssfallback(path,jsname);
                }
            };
            xhr.send(null);

        }catch(e){
            that.cssfallback(path,jsname);
        }

    };

    lsloader.runjs = function(path,name,code){
        if(!!path&&!!name&&!!code) {    //如果有path name code ,xhr来的结果,写入ls 否则是script.onload调用,去除js队列中的该项,继续执行队列
            for (var k in this.jsRunSequence) {
                if (this.jsRunSequence[k].name == name) {
                    this.jsRunSequence[k].code = code;
                }
            }
        }
        if(!!this.jsRunSequence[0]&&this.jsRunSequence[0].code!=''){
            document.getElementById(this.jsRunSequence[0].name).appendChild(document.createTextNode(this.jsRunSequence[0].code));
            this.jsRunSequence.shift();
            if(this.jsRunSequence.length>0) {
                this.runjs();
            }
        }else if(!!this.jsRunSequence[0]&&this.jsRunSequence[0].status=='failed'){
            var that = this;
            var script = document.createElement('script');
            script.src = this.jsRunSequence[0].path;
            this.jsRunSequence[0].status = 'loading'
            script.onload=function(){
                that.jsRunSequence.shift();
                if(that.jsRunSequence.length>0){
                    that.runjs(); //如果jsSequence还有排队的 继续运行
                }
            };
            var root = document.getElementsByTagName('script')[0];
            root.parentNode.insertBefore(script, root);
        }
    }

    //js回退加载 this.jsnamemap[name] 存在 证明已经在队列中 放弃
    lsloader.jsfallback = function(path,name){
            if(!!this.jsnamemap[name]){
                return;
            }else{
                this.jsnamemap[name]=name;
            }
        //jsRunSequence队列中 找到fail的文件,标记他,等到runjs循环用script请求
        for (var k in this.jsRunSequence) {
            if (this.jsRunSequence[k].name == name) {
                this.jsRunSequence[k].code = '';
                this.jsRunSequence[k].status='failed';
                this.jsRunSequence[k].path=path;
            }
        }
        this.runjs();
    };
    lsloader.cssfallback =function(path,name){
        if(!!this.cssnamemap[name]){
            return;
        }else{
            this.cssnamemap[name]=1;
        }
        var link= document.createElement('link');
        link.type='text/css';
        link.href=path;
        link.rel='stylesheet';
        var root = document.getElementsByTagName('script')[0];
        root.parentNode.insertBefore(link, root)
    }


    lsloader.runInlineScript = function(scriptId){
        var script = document.createElement('script');
        var code = document.createTextNode(document.getElementById(scriptId).innerText);
        script.appendChild(code)
        var root = document.getElementById(scriptId);
        root.parentNode.insertBefore(script, root);
    }

})()/**
 * Created by yanghuanyu on 16/3/19.
 */