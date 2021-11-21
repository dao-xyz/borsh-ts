
/**
 * Class with constructor
 */
export type Constructor<T> = new(...args: any[]) => T;

export const getSuperClasses = (targetClass: Constructor<any>) => {
    const ret = [];
    if(targetClass instanceof Function){
      let baseClass = targetClass;
      while (baseClass){
        const newBaseClass = Object.getPrototypeOf(baseClass);
        
        if(newBaseClass && newBaseClass !== Object && newBaseClass.name){
          baseClass = newBaseClass;
          ret.push(newBaseClass.name);
        }else{
          break;
        }
      }
    }
    return ret;
  }

export const extendsClass = (clazz: any, otherClazz: any): boolean => {
    if(clazz instanceof Function){
      let baseClass = clazz;
      while (baseClass){
        const newBaseClass = Object.getPrototypeOf(baseClass);
        if(otherClazz == newBaseClass)
        {
            return true;
        }
        if(newBaseClass && newBaseClass !== Object && newBaseClass.name){
          baseClass = newBaseClass;
        } else {
            return false;
        }
      }
    }
    return false;
}

export const getSubClasses = (targetClass: Constructor<any>, superClassToSubClass:Map<Constructor<any>,Set<Constructor<any>>>): Set<Constructor<any>> => {
    return superClassToSubClass.get(targetClass)
}
